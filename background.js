const DEFAULTS = {
  apiBase: "https://api.openai.com/v1",
  model: "gpt-4.1-mini"
};
const AI_PREFETCH_CACHE_KEY = "xrcAiReplyPrefetch";
const AI_PREFETCH_CONCURRENCY = 2;
const AI_PREFETCH_TTL_MS = 6 * 60 * 60 * 1000;
const aiPrefetchInFlight = new Map();
const aiPrefetchScheduled = new Map();
const aiPrefetchControllers = new Map();
const cancelledPrefetchRuns = new Set();
let aiPrefetchQueue = [];
let aiPrefetchActiveCount = 0;
let aiPrefetchCacheWriteQueue = Promise.resolve();

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
  if (message?.type === "AI_PREFETCH_JOB") {
    handleAiPrefetchJob(message.payload).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: serializeError(error) });
    });
    return true;
  }
  if (message?.type === "AI_PREFETCH_CLEAR") {
    clearAiPrefetchRun(message.runId).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: serializeError(error) });
    });
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
    if (!job?.active || job.paused) continue;
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

async function handleAiRequest({ tweet, replyMode, customPrompt, maxChars, suggestionCount }, externalSignal) {
  const settings = await chrome.storage.local.get(["apiKey", "apiBase", "model"]);
  const apiKey = String(settings.apiKey || "").trim();
  if (!apiKey) throw makeError("missingApiKey");

  const apiBase = String(settings.apiBase || DEFAULTS.apiBase).replace(/\/$/, "");
  const model = String(settings.model || DEFAULTS.model).trim();
  const prompt = replyPrompt(tweet, replyMode, customPrompt, maxChars, suggestionCount);

  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
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
    externalSignal?.removeEventListener("abort", abortFromExternal);
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

async function handleAiPrefetchJob(payload) {
  const runId = String(payload?.runId || "");
  const entries = Array.isArray(payload?.entries) ? payload.entries.slice(0, 3) : [];
  if (!runId || !entries.length) return { ok: false, error: { code: "invalidPrefetch", detail: "Missing runId or entries" } };
  const stored = await chrome.storage.local.get("autoJob");
  const job = stored.autoJob;
  if (!job?.active || job.paused || job._runId !== runId || job.replySource !== "ai") {
    return { ok: false, stale: true };
  }
  if (cancelledPrefetchRuns.has(runId)) return { ok: false, stale: true };
  const validEntries = entries.filter((entry) => {
    const index = Number(entry?.index);
    const item = job.items?.[index];
    return Number.isInteger(index) && index >= job.current && item?.url && item.url === entry?.tweet?.url;
  });
  const config = {
    replyMode: job.replyMode || payload.replyMode,
    customPrompt: job.customPrompt ?? payload.customPrompt,
    maxChars: job.maxChars || payload.maxChars
  };
  const tasks = validEntries.map((entry) => scheduleAiPrefetch(runId, entry, config));
  await Promise.all(tasks);
  return { ok: true, completed: tasks.length };
}

async function scheduleAiPrefetch(runId, entry, config) {
  const index = Number(entry.index);
  const key = `${runId}:${index}`;
  if (aiPrefetchInFlight.has(key)) return aiPrefetchInFlight.get(key);
  if (aiPrefetchScheduled.has(key)) return aiPrefetchScheduled.get(key).promise;

  let resolveTask;
  const promise = new Promise((resolve) => { resolveTask = resolve; });
  const queued = { key, runId, entry, config, promise, resolve: resolveTask, cancelled: false, startedAt: Date.now() };
  aiPrefetchScheduled.set(key, queued);

  try {
    const cached = await readAiPrefetchRecord(key);
    if (cached?.status === "ready" && cached.url === entry.tweet.url && Array.isArray(cached.replies) && cached.replies.length) {
      aiPrefetchScheduled.delete(key);
      queued.resolve(cached);
      return promise;
    }
    if (queued.cancelled || cancelledPrefetchRuns.has(runId)) {
      aiPrefetchScheduled.delete(key);
      queued.resolve(null);
      return promise;
    }
    queued.startedAt = cached?.startedAt || Date.now();
    await writeAiPrefetchRecord(key, {
      status: "queued", runId, index, url: entry.tweet.url,
      startedAt: queued.startedAt, updatedAt: Date.now()
    });
    if (queued.cancelled || cancelledPrefetchRuns.has(runId)) {
      aiPrefetchScheduled.delete(key);
      await writeAiPrefetchRecord(key, null);
      queued.resolve(null);
      return promise;
    }
    aiPrefetchQueue.push(queued);
    pumpAiPrefetchQueue();
  } catch (error) {
    aiPrefetchScheduled.delete(key);
    if (!cancelledPrefetchRuns.has(runId)) {
      const record = {
        status: "error", runId, index, url: entry.tweet.url,
        error: serializeError(error), startedAt: queued.startedAt, updatedAt: Date.now()
      };
      await writeAiPrefetchRecord(key, record).catch(() => {});
      queued.resolve(record);
    } else {
      queued.resolve(null);
    }
  }
  return promise;
}

function pumpAiPrefetchQueue() {
  while (aiPrefetchActiveCount < AI_PREFETCH_CONCURRENCY && aiPrefetchQueue.length) {
    const queued = aiPrefetchQueue.shift();
    if (queued.cancelled || cancelledPrefetchRuns.has(queued.runId)) {
      aiPrefetchScheduled.delete(queued.key);
      queued.resolve(null);
      continue;
    }
    aiPrefetchActiveCount += 1;
    const controller = new AbortController();
    aiPrefetchControllers.set(queued.key, { runId: queued.runId, controller });
    const task = prefetchAiReply(queued.runId, queued.entry, queued.config, queued.startedAt, controller.signal)
      .finally(() => {
        aiPrefetchInFlight.delete(queued.key);
        aiPrefetchControllers.delete(queued.key);
        aiPrefetchActiveCount -= 1;
        pumpAiPrefetchQueue();
      });
    aiPrefetchInFlight.set(queued.key, task);
    aiPrefetchScheduled.delete(queued.key);
    task.then(queued.resolve, () => queued.resolve(null));
  }
}

async function prefetchAiReply(runId, entry, config, startedAt, signal) {
  const index = Number(entry.index);
  const key = `${runId}:${index}`;
  const cached = await readAiPrefetchRecord(key);
  if (cached?.status === "ready" && cached.url === entry.tweet.url && Array.isArray(cached.replies) && cached.replies.length) return cached;
  try {
    if (cancelledPrefetchRuns.has(runId)) return null;
    await writeAiPrefetchRecord(key, {
      status: "pending", runId, index, url: entry.tweet.url,
      startedAt: startedAt || cached?.startedAt || Date.now(), updatedAt: Date.now()
    });
    const response = await handleAiRequest({
      tweet: entry.tweet,
      replyMode: config.replyMode,
      customPrompt: config.customPrompt,
      maxChars: config.maxChars,
      suggestionCount: 1
    }, signal);
    if (cancelledPrefetchRuns.has(runId)) return null;
    const replies = Array.isArray(response?.data?.replies) ? response.data.replies.filter((reply) => String(reply || "").trim()) : [];
    if (!replies.length) throw makeError("emptyResponse", "Prefetch returned no replies");
    const record = {
      status: "ready", runId, index, url: entry.tweet.url,
      replies, startedAt: startedAt || cached?.startedAt || Date.now(), updatedAt: Date.now()
    };
    await writeAiPrefetchRecord(key, record);
    return record;
  } catch (error) {
    if (cancelledPrefetchRuns.has(runId)) return null;
    const record = {
      status: "error", runId, index, url: entry.tweet.url,
      error: serializeError(error), startedAt: startedAt || cached?.startedAt || Date.now(), updatedAt: Date.now()
    };
    await writeAiPrefetchRecord(key, record);
    return record;
  }
}

async function readAiPrefetchRecord(key) {
  const stored = await chrome.storage.local.get(AI_PREFETCH_CACHE_KEY);
  return stored[AI_PREFETCH_CACHE_KEY]?.entries?.[key] || null;
}

function writeAiPrefetchRecord(key, record) {
  const operation = aiPrefetchCacheWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get(AI_PREFETCH_CACHE_KEY);
    const cache = stored[AI_PREFETCH_CACHE_KEY] && typeof stored[AI_PREFETCH_CACHE_KEY] === "object"
      ? stored[AI_PREFETCH_CACHE_KEY]
      : { entries: {} };
    const entries = cache.entries && typeof cache.entries === "object" ? cache.entries : {};
    const cutoff = Date.now() - AI_PREFETCH_TTL_MS;
    for (const [entryKey, value] of Object.entries(entries)) {
      if (Number(value?.updatedAt || 0) < cutoff) delete entries[entryKey];
    }
    if (record && !cancelledPrefetchRuns.has(record.runId)) entries[key] = record;
    else delete entries[key];
    await chrome.storage.local.set({ [AI_PREFETCH_CACHE_KEY]: { entries } });
    return record;
  });
  aiPrefetchCacheWriteQueue = operation.catch(() => {});
  return operation;
}

async function clearAiPrefetchRun(runIdValue) {
  const runId = String(runIdValue || "");
  if (!runId) return;
  cancelledPrefetchRuns.add(runId);
  for (const queued of aiPrefetchScheduled.values()) {
    if (queued.runId !== runId) continue;
    queued.cancelled = true;
    queued.resolve(null);
    aiPrefetchScheduled.delete(queued.key);
  }
  aiPrefetchQueue = aiPrefetchQueue.filter((queued) => {
    if (queued.runId !== runId) return true;
    queued.cancelled = true;
    queued.resolve(null);
    return false;
  });
  for (const active of aiPrefetchControllers.values()) {
    if (active.runId === runId) active.controller.abort();
  }
  const operation = aiPrefetchCacheWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get(AI_PREFETCH_CACHE_KEY);
    const cache = stored[AI_PREFETCH_CACHE_KEY];
    if (!cache?.entries) return;
    const entries = { ...cache.entries };
    for (const key of Object.keys(entries)) {
      if (key.startsWith(`${runId}:`)) delete entries[key];
    }
    await chrome.storage.local.set({ [AI_PREFETCH_CACHE_KEY]: { entries } });
  });
  aiPrefetchCacheWriteQueue = operation.catch(() => {});
  await operation;
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
