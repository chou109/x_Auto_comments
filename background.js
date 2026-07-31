const DEFAULTS = {
  apiBase: "https://api.openai.com/v1",
  model: "gpt-4.1-mini"
};

function makeError(code, detail = "") {
  const error = new Error(JSON.stringify({ code, detail: String(detail || "") }));
  error.code = code;
  error.detail = String(detail || "");
  return error;
}
function serializeError(error) {
  if (error?.code) return { code: error.code, detail: error.detail || "" };
  try {
    const parsed = JSON.parse(error?.message || "");
    if (parsed?.code) return parsed;
  } catch {}
  return { code: "providerError", detail: error?.message || String(error || "Unknown error") };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "XRC_CONTEXT") {
    sendResponse({ ok: true, tabId: sender.tab?.id ?? null, now: Date.now() });
    return false;
  }
  if (message?.type === "XRC_HEARTBEAT") {
    sendResponse({ ok: true, now: Date.now() });
    return false;
  }
  if (message?.type === "XRC_REGISTER_JOB") {
    registerActiveJob(sender.tab?.id, message.storageKey, message.accountId)
      .then(() => sendResponse({ ok: true, now: Date.now() }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }
  if (!["AI_REQUEST", "POST_AI_REQUEST"].includes(message?.type)) return false;
  const handler = message.type === "POST_AI_REQUEST" ? handlePostAiRequest : handleAiRequest;
  handler(message.payload).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: serializeError(error) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(ensureHeartbeatAlarm);
chrome.runtime.onStartup.addListener(ensureHeartbeatAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "xrc-job-heartbeat") return;
  wakeActiveJobTabs().catch(() => {});
});
ensureHeartbeatAlarm();

function ensureHeartbeatAlarm() {
  chrome.alarms.create("xrc-job-heartbeat", { delayInMinutes: 0.5, periodInMinutes: 0.5 });
}

async function registerActiveJob(tabId, storageKey, accountId) {
  if (!tabId) return;
  const stored = await chrome.storage.session.get("xrcActiveJobs");
  const jobs = stored.xrcActiveJobs && typeof stored.xrcActiveJobs === "object" ? stored.xrcActiveJobs : {};
  jobs[storageKey || "job"] = { tabId, accountId: accountId || "unknown", updatedAt: Date.now() };
  await chrome.storage.session.set({ xrcActiveJobs: jobs });
}

async function wakeActiveJobTabs() {
  const jobKeys = ["autoJob", "postJob", "collectJob", "replyLoopJob"];
  const [storedJobs, session] = await Promise.all([
    chrome.storage.local.get(jobKeys),
    chrome.storage.session.get("xrcActiveJobs")
  ]);
  const registered = session.xrcActiveJobs && typeof session.xrcActiveJobs === "object" ? session.xrcActiveJobs : {};
  const tabIds = new Set();
  for (const key of jobKeys) {
    const job = storedJobs[key];
    if (!job?.active) continue;
    if (Number.isInteger(job.ownerTabId)) tabIds.add(job.ownerTabId);
    else if (Number.isInteger(registered[key]?.tabId)) tabIds.add(registered[key].tabId);
  }
  for (const tabId of tabIds) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "XRC_JOB_TICK", now: Date.now() });
    } catch {
      // The lease in content.js will expire, allowing a matching account tab
      // to reclaim the job after a browser restart or tab replacement.
    }
  }
}

async function handlePostAiRequest({ prompt, maxChars }) {
  const settings = await chrome.storage.local.get(["apiKey", "apiBase", "model"]);
  const apiKey = String(settings.apiKey || "").trim();
  if (!apiKey) throw new Error(JSON.stringify({ code: "missingApiKey", detail: "" }));
  const apiBase = String(settings.apiBase || DEFAULTS.apiBase).replace(/\/$/, "");
  const model = String(settings.model || DEFAULTS.model).trim();
  const hardLimit = Math.max(20, Math.min(280, Number(maxChars) || 280));
  const directive = String(prompt || "").trim();
  if (!directive) throw makeError("missingPostPrompt");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You write standalone X posts. Return valid JSON only." },
          { role: "user", content: `Write one standalone X post using this user directive: ${JSON.stringify(directive)}\nHARD LIMIT: ${hardLimit} characters including all spaces, links, mentions and tickers. Do not mention that this was AI-generated. Do not invent facts, impersonate people, promise returns, or add unsupported claims. Return JSON exactly as {"posts":["..."]}.` }
        ]
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") throw makeError("timeout");
    throw makeError("network", error?.message || String(error));
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw makeError("providerError", body?.error?.message || `HTTP ${response.status}`);
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw makeError("emptyResponse");
  try {
    const data = JSON.parse(String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return { ok: true, data };
  } catch {
    throw makeError("invalidJson");
  }
}

async function handleAiRequest({ tweet, replyMode, customPrompt, maxChars, suggestionCount }) {
  const settings = await chrome.storage.local.get(["apiKey", "apiBase", "model"]);
  const apiKey = String(settings.apiKey || "").trim();
  if (!apiKey) throw makeError("missingApiKey");

  const apiBase = String(settings.apiBase || DEFAULTS.apiBase).replace(/\/$/, "");
  const model = String(settings.model || DEFAULTS.model).trim();
  const prompt = replyPrompt(tweet, replyMode, customPrompt, maxChars, suggestionCount);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful Crypto Twitter community assistant. Return valid JSON only." },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") throw makeError("timeout");
    throw makeError("network", error?.message || String(error));
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw makeError("providerError", body?.error?.message || `HTTP ${response.status}`);
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    const finishReason = choice?.finish_reason;
    if (finishReason === "length") throw makeError("outputLength");
    throw makeError("emptyResponse", finishReason ? `finish_reason=${finishReason}` : "");
  }
  try {
    const jsonText = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return { ok: true, data: JSON.parse(jsonText) };
  } catch {
    throw makeError("invalidJson");
  }
}

function tweetContext(tweet) {
  return JSON.stringify({ author: tweet.author, text: tweet.text, likes: tweet.likes, ageHours: tweet.ageHours, url: tweet.url });
}

function replyPrompt(tweet, replyMode, customPrompt, maxChars, suggestionCount) {
  const directive = String(customPrompt || "").trim();
  const hardLimit = Math.max(20, Math.min(280, Number(maxChars) || 280));
  const count = Math.max(1, Math.min(10, Number(suggestionCount) || 5));
  if (replyMode === "directed" && directive) {
    return `Write exactly ${count} distinct English X replies for a directed community campaign.\nCampaign directive from the user (highest priority): ${JSON.stringify(directive)}\nPlacement post: ${tweetContext(tweet)}\nHARD LENGTH LIMIT: every complete reply must be ${hardLimit} characters or fewer, counting spaces, punctuation, mentions, tickers, links, and contract addresses. This hard limit overrides any longer limit in the campaign directive.\nThe reply must communicate the campaign directive. The placement post is only conversational context: do not summarize it or make it the main subject. When useful, add a brief natural bridge so the reply is not abrupt. Do not invent facts, impersonate people, promise returns, or make unsupported claims. Every reply must use a different angle. Return JSON: {"replies":[...]}`;
  }
  return `Write exactly ${count} distinct English replies to this X post.\nPost: ${tweetContext(tweet)}\nHARD LENGTH LIMIT: every complete reply must be ${hardLimit} characters or fewer, counting spaces, punctuation, mentions, tickers, links, and contract addresses.\nRules: natural Crypto Twitter voice; no praise-for-praise's-sake; no promotion; no financial promises; no repeated idea; do not invent facts; match the post tone. Return JSON: {"replies":[...]}`;
}
