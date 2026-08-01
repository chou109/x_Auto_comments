(() => {
  if (window.__xReplyCopilotLoaded) return;
  window.__xReplyCopilotLoaded = true;
  window.addEventListener("unhandledrejection", (event) => {
    if (!isExtensionContextInvalidated(event.reason)) return;
    event.preventDefault();
    showExtensionReloadNotice();
  });

  const DEFAULTS = {
    authors: "",
    keywords: "",
    targetUrls: "",
    directTargetRepeatCount: 1,
    accountCollectLimit: 300,
    loopMode: "search",
    loopTotalLimit: 100,
    loopRoundLimit: 50,
    loopRoundIntervalMinutes: 5,
    loopEmptyRoundLimit: 3,
    minLikes: 100,
    maxAgeDays: 7,
    sortBy: "views",
    excludeReplies: true,
    excludeQuotes: true,
    replyAlreadyReplied: false,
    strictKeywordBody: false,
    apiBase: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    replySource: "ai",
    specifiedReplies: [],
    specifiedReplyOrder: "sequential",
    replyMode: "directed",
    customPrompt: "",
    maxChars: 280,
    suggestionCount: 5,
    autoReplyCount: 3,
    autoDelaySeconds: 10,
    delayMode: "fixed",
    randomDelayMin: 10,
    randomDelayMax: 30,
    imageUseChance: 50,
    imageCount: 1,
    imageSelectionMode: "random",
    imageLibrary: [],
    autoLikeReply: false,
    autoLikePost: false,
    postSource: "specified",
    postSpecifiedContents: [],
    postSpecifiedOrder: "sequential",
    postAiPrompt: "",
    postMaxChars: 280,
    autoPostCount: 3,
    postLoopEnabled: false,
    postLoopTotalLimit: 100,
    postLoopRoundIntervalMinutes: 5,
    postLoopEmptyRoundLimit: 3,
    postDelayMode: "fixed",
    postDelaySeconds: 60,
    postRandomDelayMin: 60,
    postRandomDelayMax: 180,
    postImageUseChance: 50,
    postImageCount: 1,
    postImageSelectionMode: "random",
    postImageLibrary: [],
    postDestination: "timeline",
    postCommunity: "",
    activeHoursEnabled: false,
    activeHourStart: "08:00",
    activeHourEnd: "23:00",
    safeguardsEnabled: false,
    replyHourlyLimit: 30,
    replyDailyLimit: 200,
    postHourlyLimit: 12,
    postDailyLimit: 50,
    consecutiveFailureLimit: 5
  };
  const REPLY_PROFILE_KEYS = ["authors", "keywords", "targetUrls", "directTargetRepeatCount", "accountCollectLimit", "loopMode", "loopTotalLimit", "loopRoundLimit", "loopRoundIntervalMinutes", "loopEmptyRoundLimit", "minLikes", "maxAgeDays", "excludeReplies", "excludeQuotes", "replyAlreadyReplied", "strictKeywordBody", "sortBy", "replySource", "specifiedReplies", "specifiedReplyOrder", "replyMode", "customPrompt", "maxChars", "suggestionCount", "autoReplyCount", "autoDelaySeconds", "delayMode", "randomDelayMin", "randomDelayMax", "imageUseChance", "imageCount", "imageSelectionMode", "imageLibrary", "activeHoursEnabled", "activeHourStart", "activeHourEnd", "replyHourlyLimit", "replyDailyLimit", "consecutiveFailureLimit"];
  const POST_PROFILE_KEYS = ["postSource", "postSpecifiedContents", "postSpecifiedOrder", "postAiPrompt", "postMaxChars", "autoPostCount", "postDelayMode", "postDelaySeconds", "postRandomDelayMin", "postRandomDelayMax", "postImageUseChance", "postImageCount", "postImageSelectionMode", "postImageLibrary", "postDestination", "postCommunity", "postLoopEnabled", "postLoopTotalLimit", "postLoopRoundIntervalMinutes", "postLoopEmptyRoundLimit", "activeHoursEnabled", "activeHourStart", "activeHourEnd", "postHourlyLimit", "postDailyLimit", "consecutiveFailureLimit"];
  const state = { settings: { ...DEFAULTS }, locale: "zh-CN", tweets: [], selected: null, minimized: false, autoRunning: false, postRunning: false, autoStop: false, autoConfirm: false, autoStatus: "", collecting: false, collectStop: false, repliedUrls: new Set(), tabId: null, accountId: "unknown", taskBars: { "xrc-jobbar": null, "xrc-post-jobbar": null } };
  const delayWaiters = new Set();
  const ownerInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runningJobs = {};
  const AI_PREFETCH_CACHE_KEY = "xrcAiReplyPrefetch";
  const AI_PREFETCH_BUFFER_SIZE = 3;
  function ownsJobFence(job) { return job?.ownerTabId === state.tabId && state.tabId != null; }
  function makeRunId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  async function readRunnableJob(storageKey) {
    const latest = (await chrome.storage.local.get(storageKey))[storageKey];
    if (!latest?.active) return null;
    if (latest.paused) return null;
    if (latest.ownerTabId != null && latest.ownerTabId !== state.tabId) return null;
    if (!state.tabId) return null;
    if (latest.accountId && latest.accountId !== "unknown" && state.accountId !== "unknown" && latest.accountId !== state.accountId) return null;
    return latest;
  }
  async function commitJobMutation(storageKey, expectedRunId, mutate) {
    const latest = await chrome.storage.local.get(storageKey);
    const job = latest[storageKey];
    if (!job?.active) return null;
    if (!job._runId) return null; // legacy job without runId — refuse mutation
    if (job._runId !== expectedRunId) return null;
    if (job.ownerTabId != null && job.ownerTabId !== state.tabId) return null;
    if (!state.tabId) return null;
    const mutated = mutate(job);
    if (!mutated) return null;
    mutated._runId = expectedRunId;
    await chrome.storage.local.set({ [storageKey]: mutated });
    return mutated;
  }
  const i18n = window.XRC_I18N;
  function localizeText(value) { return i18n?.text(value, state.locale) || String(value ?? ""); }
  function localizeError(error) { return i18n?.errorMessage(error, state.locale) || String(error?.message || error || "Unknown error"); }
  function localeLabel() { return state.locale === "zh-CN" ? "EN" : "中"; }
  function localizedLanguageNotice() { return state.locale === "zh-CN" ? "语言已切换为中文" : "语言切换为英文"; }
  function applyLocale() {
    if (!root.isConnected) return;
    root.lang = state.locale;
    i18n?.localizeElement(root, state.locale);
    i18n?.localizeStaticNodes(staticTextNodes, state.locale);
    const toggle = byId("xrc-language-toggle");
    if (toggle) {
      toggle.textContent = localeLabel();
      toggle.title = state.locale === "zh-CN" ? "Switch to English" : "切换为中文";
      toggle.setAttribute("aria-label", toggle.title);
    }
    renderList();
    renderImageLibrary();
    renderPostImageLibrary();
    updateSpecifiedRowLabels();
    updatePostContentLabels();
    renderProfileSelectors().catch(() => {});
    for (const [barId, status] of Object.entries(state.taskBars)) {
      if (status) renderTaskBar(barId, status.message, status.meta, status.waiting);
    }
    updateJobPauseButton(byId("xrc-pause-job")?.dataset.act === "resume-job");
    updateJobLoopActions(!byId("xrc-stop-loop-job")?.classList.contains("xrc-hidden"));
    updatePostPauseButton(byId("xrc-post-pause")?.dataset.act === "resume-post");
    const postCancel = byId("xrc-post-jobbar")?.querySelector('[data-act="cancel-post"]');
    if (postCancel) postCancel.textContent = localizeText("结束发帖");
    root.classList.remove("xrc-locale-pending");
  }
  async function toggleLanguage() {
    state.locale = state.locale === "zh-CN" ? "en-US" : "zh-CN";
    await chrome.storage.local.set({ xrcLanguage: state.locale });
    applyLocale();
    toast(localizedLanguageNotice());
  }

  const root = document.createElement("div");
  root.id = "xrc-root";
  root.classList.add("xrc-locale-pending");
  root.innerHTML = `
    <section class="xrc-panel">
      <header><div><strong data-i18n="X 自动评论助手">X 自动评论助手</strong><small data-i18n="采集 · 评论 · 发帖">采集 · 评论 · 发帖</small><small class="xrc-version">v0.21.14</small></div><div><button id="xrc-language-toggle" class="xrc-language-toggle" data-act="toggle-language" title="Switch to English" aria-label="Switch to English">EN</button><button data-act="min" data-i18n-title="最小化" title="最小化">−</button><button data-act="close" data-i18n-title="关闭" title="关闭">×</button></div></header>
      <main>
        <div class="xrc-sticky-stack">
          <div id="xrc-jobbar" class="xrc-jobbar"><div class="xrc-jobbar-status"><span class="xrc-jobbar-primary"></span><small class="xrc-jobbar-meta"></small></div><div><button type="button" id="xrc-pause-job" class="pause" data-act="pause-job">暂停</button><button type="button" id="xrc-cancel-job" data-act="cancel-job">结束任务</button><button type="button" id="xrc-stop-loop-job" class="loop-stop xrc-hidden" data-act="stop-loop">终止循环</button></div></div>
          <nav><button class="active" data-tab="filter">筛选</button><button data-tab="queue">结果 <b id="xrc-count">0</b></button><button data-tab="settings">评论设置</button><button data-tab="posting">自动发帖</button></nav>
        </div>
        <div class="xrc-view active" data-view="filter">
          <details class="xrc-settings-block" open>
            <summary><b>筛选条件</b><small>作者与关键词按采集方式分别使用</small></summary>
            <div class="xrc-details-body">
            <label>作者账号 <span>填写 @ 后面的账号 ID</span><input id="xrc-authors" placeholder="例如：Davincij15"></label>
            <label>关键词 <span>逗号分隔，命中任意一个</span><textarea id="xrc-keywords" rows="2" placeholder="例如：Bitcoin, BTC"></textarea></label>
            <div class="xrc-grid"><label>最低点赞<input id="xrc-likes" type="number" min="0"></label><label>最近天数<input id="xrc-days" type="number" min="1"></label></div>
            <label>结果处理顺序<select id="xrc-sort"><option value="views">浏览量：高 → 低</option><option value="viewsAsc">浏览量：低 → 高</option><option value="newest">日期：新 → 旧</option><option value="oldest">日期：旧 → 新</option><option value="likes">点赞数：高 → 低</option></select></label>
            <div class="xrc-check-grid">
              <label class="xrc-check" title="不采集回复其他账号或对话的帖子"><input id="xrc-replies" type="checkbox"> 排除回复帖</label>
              <label class="xrc-check" title="不采集带有嵌入原帖的引用帖子"><input id="xrc-quotes" type="checkbox"> 排除引用帖</label>
              <label class="xrc-check"><input id="xrc-repeat" type="checkbox"> 允许重复回复</label>
              <label class="xrc-check"><input id="xrc-strict-keyword" type="checkbox"> 正文必须含关键词</label>
            </div>
            </div>
          </details>
          <details class="xrc-settings-block" open>
            <summary><b>采集与循环</b><small>扫描、采集、循环评论</small></summary>
            <div class="xrc-details-body">
            <div class="xrc-section-heading"><div><b>快速操作</b></div></div>
            <div class="xrc-action-grid">
              <button class="xrc-primary" data-act="scan">扫描当前页面</button>
              <button class="xrc-secondary" data-act="search">打开组合搜索</button>
            </div>
            <div class="xrc-section-heading" style="margin-top:12px"><div><b>自动采集</b><small>按有效结果计数，翻到底后结束</small></div></div>
            <label>最多采集条数<input id="xrc-collect-limit" type="number" min="20" max="2000"></label>
            <div class="xrc-action-grid">
              <button id="xrc-collect-button" class="xrc-secondary" data-act="collect-account">采集作者账号</button>
              <button id="xrc-collect-search-button" class="xrc-secondary" data-act="collect-search">采集关键词结果</button>
            </div>
            <div class="xrc-section-heading" style="margin-top:12px"><div><b>循环采集并评论</b><small>多轮自动执行</small></div></div>
            <label>采集模式<select id="xrc-loop-mode"><option value="search">关键词搜索</option><option value="account">指定账号</option></select></label>
            <div class="xrc-grid"><label>总发送上限 <span>最高 10000</span><input id="xrc-loop-total" type="number" min="1" max="10000"></label><label>每轮采集上限<input id="xrc-loop-round" type="number" min="1" max="2000"></label></div>
            <div class="xrc-grid"><label>轮次间隔（分钟）<input id="xrc-loop-interval" type="number" min="1" max="1440"></label><label>连续空轮上限<input id="xrc-loop-empty" type="number" min="1" max="20"></label></div>
            <div class="xrc-action-grid"><button id="xrc-loop-start" class="xrc-primary" data-act="start-loop">开始循环</button><button class="xrc-secondary" data-act="pause-loop">暂停 / 继续</button></div>
            <button class="xrc-danger-outline" data-act="stop-loop">终止循环</button>
            <p id="xrc-loop-status" class="xrc-hint">达到总上限后自动结束；再次运行需重新点击开始。</p>
            </div>
          </details>
          <details class="xrc-settings-block">
            <summary><b>指定帖子链接</b><small>直接载入一个或多个帖子</small></summary>
            <div class="xrc-details-body">
            <label>帖子链接 <span>每行一条</span><textarea id="xrc-target-urls" rows="4" placeholder="https://x.com/账号/status/帖子ID"></textarea></label>
            <label>每个帖子评论次数 <span>同一帖子连续发送多条不同评论</span><input id="xrc-direct-repeat-count" type="number" min="1" max="100"></label>
            <button class="xrc-secondary" data-act="load-targets">载入指定帖子</button>
            </div>
          </details>
        </div>
        <div class="xrc-view" data-view="queue"><div id="xrc-list" class="xrc-list"></div></div>
        <div class="xrc-view" data-view="settings">
          <details class="xrc-settings-block" open>
            <summary><b>方案与 API</b></summary>
            <div class="xrc-details-body">
            <div class="xrc-profile-box" style="margin-top:0;border:0;padding:0;background:transparent">
              <label>评论配置方案<select id="xrc-reply-profile"></select></label>
              <label>方案名称<input id="xrc-reply-profile-name" placeholder="例如：BTC英文推广"></label>
              <div class="xrc-grid"><button class="xrc-secondary" data-act="save-reply-profile">保存/覆盖方案</button><button class="xrc-secondary" data-act="load-reply-profile">加载方案</button></div>
              <button class="xrc-secondary" data-act="delete-reply-profile">删除所选方案</button>
            </div>
            <label style="margin-top:8px">API Key<input id="xrc-key" type="password" placeholder="sk-..."></label>
            <label>API 地址<input id="xrc-base" placeholder="https://api.openai.com/v1"></label>
            <label>模型<input id="xrc-model" placeholder="gpt-4.1-mini"></label>
            </div>
          </details>
          <details class="xrc-settings-block" open>
            <summary><b>回复内容</b><small>AI 生成或指定固定内容</small></summary>
            <div class="xrc-details-body">
            <label>回复内容来源<select id="xrc-source"><option value="ai">AI 生成</option><option value="specified">指定固定内容</option></select></label>
            <div id="xrc-specified-settings">
              <details id="xrc-specified-details" open>
                <summary><b>指定回复内容</b><span id="xrc-specified-count">0 条</span></summary>
                <div class="xrc-specified-body">
                  <div class="xrc-content-actions">
                    <button class="xrc-add-reply" data-act="add-specified">＋ 在顶部添加新内容</button>
                    <button class="xrc-add-reply" data-act="toggle-reply-bulk-import">批量导入</button>
                  </div>
                  <div id="xrc-reply-bulk-import" class="xrc-bulk-import xrc-hidden">
                    <label>粘贴编号内容<span>支持 1.、2.、3. 格式</span><textarea id="xrc-reply-bulk-text" rows="10" placeholder="1. 第一条回复正文&#10;合约地址&#10;&#10;2. 第二条回复正文&#10;合约地址"></textarea></label>
                    <p class="xrc-hint">每个编号到下一个编号之间视为一条回复；导入将追加到现有内容并自动忽略重复项。</p>
                    <div class="xrc-bulk-buttons"><button data-act="cancel-reply-bulk-import">取消</button><button class="confirm" data-act="import-reply-contents">追加导入</button></div>
                  </div>
                  <div id="xrc-specified-list"></div>
                </div>
              </details>
              <label>使用方式<select id="xrc-specified-order"><option value="sequential">按顺序轮换</option><option value="random">每次随机选择</option></select></label>
            </div>
            <div id="xrc-ai-settings">
              <label>回复模式<select id="xrc-mode"><option value="directed">定向回复（由我的提示词主导）</option><option value="contextual">原帖回复（围绕帖子内容）</option></select></label>
              <label>生成建议数量<input id="xrc-suggestions" type="number" min="1" max="10"></label>
              <label>定向回复提示词 <span>定向模式必填</span><textarea id="xrc-prompt" rows="6" placeholder="例如：重点表达比特币长期主义；自然提到项目名；不要谈价格；语气坚定；英文 20 词以内。"></textarea></label>
            </div>
            </div>
          </details>
          <details class="xrc-settings-block" open>
            <summary><b>发送设置</b><small>数量、间隔、图片</small></summary>
            <div class="xrc-details-body">
            <label>单条回复字符上限 <span>X 普通回复最多 280</span><input id="xrc-maxchars" type="number" min="20" max="280"></label>
            <label>自动回复数量<input id="xrc-autocount" type="number" min="1" max="2000"></label>
            <label class="xrc-check"><input id="xrc-auto-like-reply" type="checkbox"> 发送后给自己的回复点赞</label>
            <label>自动发送间隔模式<select id="xrc-delaymode"><option value="fixed">固定时间</option><option value="random">随机时间区间</option></select></label>
            <div id="xrc-fixed-delay"><label>固定间隔（秒） <span>最低 1 秒</span><input id="xrc-delay" type="number" min="1" max="600"></label></div>
            <div id="xrc-random-delay" class="xrc-grid"><label>随机最小秒数<input id="xrc-delay-min" type="number" min="1" max="600"></label><label>随机最大秒数<input id="xrc-delay-max" type="number" min="1" max="600"></label></div>
            <div class="xrc-media-settings" style="margin:14px 0 0;padding:10px;border:1px solid #2f3336;border-radius:10px">
              <label>随机评论图片 <span>可一次选择多张，保存在扩展本地</span><input id="xrc-image-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label>
              <label>使用图片概率（%） <span>设为 0 则始终不带图</span><input id="xrc-image-chance" type="number" min="0" max="100"></label>
              <div class="xrc-grid"><label>每次发送图片数量 <span>X 最多支持 4 张</span><input id="xrc-image-count" type="number" min="1" max="4"></label><label>图片选择方式<select id="xrc-image-selection"><option value="random">随机选取</option><option value="sequential">顺序轮换</option><option value="all">全部发送</option></select></label></div>
              <div id="xrc-image-list" class="xrc-image-list"></div>
            </div>
            </div>
          </details>
          <details class="xrc-settings-block">
            <summary><b>运行保护</b><small>默认关闭；开启后限制发送频率与时段</small></summary>
            <div class="xrc-details-body">
            <label class="xrc-check"><input id="xrc-safeguards-enabled" type="checkbox"> 启用运行保护</label>
            <div id="xrc-safeguards-body">
            <label class="xrc-check"><input id="xrc-active-hours-enabled" type="checkbox"> 仅在指定时段运行</label>
            <div class="xrc-grid"><label>开始时间<input id="xrc-active-start" type="time"></label><label>结束时间<input id="xrc-active-end" type="time"></label></div>
            <div class="xrc-grid"><label>评论每小时上限<input id="xrc-reply-hour-limit" type="number" min="1" max="1000"></label><label>评论每日上限<input id="xrc-reply-day-limit" type="number" min="1" max="10000"></label></div>
            <div class="xrc-grid"><label>发帖每小时上限<input id="xrc-post-hour-limit" type="number" min="1" max="1000"></label><label>发帖每日上限<input id="xrc-post-day-limit" type="number" min="1" max="10000"></label></div>
            <label>连续失败熔断次数<input id="xrc-failure-limit" type="number" min="1" max="50"></label>
            <p class="xrc-hint">每个浏览器环境独立计数。评论与发帖的活跃时段和熔断共享上面设置。</p>
            </div>
            </div>
          </details>
          <button class="xrc-primary" data-act="save">保存设置</button>
          <p class="xrc-hint">定向模式下，你的提示词决定回复方向，原帖只用于自然衔接。密钥和提示词保存在浏览器扩展本地存储中。</p>
        </div>
        <div class="xrc-view" data-view="posting">
          <div id="xrc-post-jobbar" class="xrc-post-jobbar"><div class="xrc-jobbar-status"><span class="xrc-jobbar-primary"></span><small class="xrc-jobbar-meta"></small></div><div><button type="button" id="xrc-post-pause" class="pause" data-act="pause-post">暂停</button><button type="button" data-act="cancel-post">结束发帖</button></div></div>
          <div class="xrc-module-title"><strong>自动发帖</strong><small>独立于自动评论，内容、图片和进度互不混用</small></div>
          <details class="xrc-settings-block" open>
            <summary><b>方案与目标</b></summary>
            <div class="xrc-details-body">
            <div class="xrc-profile-box" style="margin-top:0;border:0;padding:0;background:transparent">
              <label>发帖配置方案<select id="xrc-post-profile"></select></label>
              <label>方案名称<input id="xrc-post-profile-name" placeholder="例如：社区日常发帖"></label>
              <div class="xrc-grid"><button class="xrc-secondary" data-act="save-post-profile">保存/覆盖方案</button><button class="xrc-secondary" data-act="load-post-profile">加载方案</button></div>
              <button class="xrc-secondary" data-act="delete-post-profile">删除所选方案</button>
            </div>
            <label style="margin-top:8px">发布位置<select id="xrc-post-destination"><option value="timeline">公开时间线</option><option value="community">指定 X 社区</option></select></label>
            <div id="xrc-post-community-wrap"><label>社区链接或 ID <span>例如 https://x.com/i/communities/123…</span><input id="xrc-post-community" placeholder="社区链接或数字 ID"></label></div>
            <label>发帖内容来源<select id="xrc-post-source"><option value="specified">指定固定内容</option><option value="ai">AI 生成</option></select></label>
            </div>
          </details>
          <details class="xrc-settings-block" open>
            <summary><b>发帖内容</b></summary>
            <div class="xrc-details-body">
            <div id="xrc-post-specified-settings">
              <details id="xrc-post-specified-details">
                <summary><b>指定发帖内容</b><span id="xrc-post-specified-count">0 条</span></summary>
                <div class="xrc-specified-body">
                  <div class="xrc-content-actions">
                    <button class="xrc-add-reply" data-act="add-post-content">＋ 在顶部添加新内容</button>
                    <button class="xrc-add-reply" data-act="toggle-post-bulk-import">批量导入</button>
                  </div>
                  <div id="xrc-post-bulk-import" class="xrc-bulk-import xrc-hidden">
                    <label>粘贴编号内容<span>支持 1.、2.、3. 格式</span><textarea id="xrc-post-bulk-text" rows="10" placeholder="1. 第一条帖子正文&#10;合约地址&#10;&#10;2. 第二条帖子正文&#10;合约地址"></textarea></label>
                    <p class="xrc-hint">每个编号到下一个编号之间视为一条帖子；导入将追加到现有内容并自动忽略重复项。</p>
                    <div class="xrc-bulk-buttons"><button data-act="cancel-post-bulk-import">取消</button><button class="confirm" data-act="import-post-contents">追加导入</button></div>
                  </div>
                  <div id="xrc-post-specified-list"></div>
                </div>
              </details>
              <label>使用方式<select id="xrc-post-specified-order"><option value="sequential">按顺序轮换</option><option value="random">每次随机选择</option></select></label>
            </div>
            <div id="xrc-post-ai-settings">
              <label>AI 发帖提示词 <span>描述主题、语气和必须包含的内容</span><textarea id="xrc-post-prompt" rows="6" placeholder="例如：生成英文 Bitcoin 社区帖子，语气自然，不作收益承诺，每条角度不同。"></textarea></label>
            </div>
            </div>
          </details>
          <details class="xrc-settings-block" open>
            <summary><b>发送设置</b><small>数量、间隔、图片</small></summary>
            <div class="xrc-details-body">
            <label>单条帖子字符上限 <span>X 普通帖子最多 280</span><input id="xrc-post-maxchars" type="number" min="20" max="280"></label>
            <label>自动发帖数量<input id="xrc-post-count" type="number" min="1" max="2000"></label>
            <label class="xrc-check"><input id="xrc-auto-like-post" type="checkbox"> 发送后给自己的帖子点赞</label>
            <label>发帖间隔模式<select id="xrc-post-delaymode"><option value="fixed">固定时间</option><option value="random">随机时间区间</option></select></label>
            <div id="xrc-post-fixed-delay"><label>固定间隔（秒）<input id="xrc-post-delay" type="number" min="1" max="86400"></label></div>
            <div id="xrc-post-random-delay" class="xrc-grid"><label>随机最小秒数<input id="xrc-post-delay-min" type="number" min="1" max="86400"></label><label>随机最大秒数<input id="xrc-post-delay-max" type="number" min="1" max="86400"></label></div>
            <div class="xrc-media-settings" style="margin:14px 0 0;padding:10px;border:1px solid #2f3336;border-radius:10px">
              <label>随机发帖图片 <span>发帖专用图片库，不与评论图片混用</span><input id="xrc-post-image-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label>
              <label>使用图片概率（%） <span>随机结果也可以不选图片</span><input id="xrc-post-image-chance" type="number" min="0" max="100"></label>
              <div class="xrc-grid"><label>每次发送图片数量 <span>X 最多支持 4 张</span><input id="xrc-post-image-count" type="number" min="1" max="4"></label><label>图片选择方式<select id="xrc-post-image-selection"><option value="random">随机选取</option><option value="sequential">顺序轮换</option><option value="all">全部发送</option></select></label></div>
              <div id="xrc-post-image-list" class="xrc-image-list"></div>
            </div>
            </div>
          </details>
          <details class="xrc-settings-block">
            <summary><b>循环发帖</b><small>有总上限的批次循环</small></summary>
            <div class="xrc-details-body">
            <label class="xrc-check"><input id="xrc-post-loop-enabled" type="checkbox"> 启用有限循环发帖</label>
            <div class="xrc-grid"><label>总发送上限 <span>最高 10000</span><input id="xrc-post-loop-total" type="number" min="1" max="10000"></label><label>批次间隔（分钟）<input id="xrc-post-loop-interval" type="number" min="1" max="1440"></label></div>
            <label>连续空批次上限 <span>整批没有成功发布时计数</span><input id="xrc-post-loop-empty" type="number" min="1" max="20"></label>
            <p class="xrc-hint">"自动发帖数量"作为每批数量；达到总上限后结束，必须手动重新启动。</p>
            </div>
          </details>
          <button class="xrc-primary" data-act="save-post">保存发帖设置</button>
          <button class="xrc-post-start" data-act="start-post">开始自动发帖</button>
          <p class="xrc-hint">社区发帖会先进入目标社区并校验社区路径；无法确认发布位置时会暂停，避免误发到公开时间线。</p>
        </div>
        <div id="xrc-detail" class="xrc-detail"></div>
      </main>
      <div id="xrc-toast"></div>
    </section>`;
  document.documentElement.appendChild(root);
  const staticTextNodes = i18n?.captureStaticNodes ? i18n.captureStaticNodes(root) : [];

  init().catch((error) => {
    if (isExtensionContextInvalidated(error)) return showExtensionReloadNotice();
    console.error("X Reply Copilot 初始化失败", error);
  });

  async function init() {
    const context = await chrome.runtime.sendMessage({ type: "XRC_CONTEXT" }).catch(() => null);
    state.tabId = context?.tabId ?? null;
    state.accountId = await detectCurrentAccountId();
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS).concat("apiKey", "xrcLanguage"));
    state.settings = { ...DEFAULTS, ...stored };
    state.locale = i18n?.normalizeLocale(stored.xrcLanguage) || "zh-CN";
    fillForm();
    await renderProfileSelectors();
    applyLocale();
    root.addEventListener("click", onClick);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.xrcLanguage || !root.isConnected) return;
      const locale = i18n?.normalizeLocale(changes.xrcLanguage.newValue) || "zh-CN";
      if (locale === state.locale) return;
      state.locale = locale;
      applyLocale();
    });
    byId("xrc-jobbar").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-act]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.act === "pause-job") setAutoJobPaused(true).catch((error) => toast(`暂停失败：${error.message}`, true));
      if (button.dataset.act === "resume-job") setAutoJobPaused(false).catch((error) => toast(`继续失败：${error.message}`, true));
      if (button.dataset.act === "cancel-job") cancelAutoJob().catch((error) => toast(`结束任务失败：${error.message}`, true));
      if (button.dataset.act === "stop-loop") stopReplyLoop().catch((error) => toast(`终止循环失败：${error.message}`, true));
    }, true);
    root.addEventListener("change", (event) => {
      if (event.target.id === "xrc-reply-profile") {
        return event.target.value ? loadNamedProfile("reply") : undefined;
      }
      if (event.target.id === "xrc-post-profile") {
        return event.target.value ? loadNamedProfile("post") : undefined;
      }
      if (event.target.id === "xrc-delaymode") updateDelayModeUi();
      if (event.target.id === "xrc-source") updateReplySourceUi();
      if (event.target.id === "xrc-safeguards-enabled") updateSafeguardsUi();
      if (event.target.id === "xrc-image-files") return addImages(event.target.files);
      if (event.target.id === "xrc-post-delaymode") updatePostDelayModeUi();
      if (event.target.id === "xrc-post-source") updatePostSourceUi();
      if (event.target.id === "xrc-post-destination") updatePostDestinationUi();
      if (event.target.id === "xrc-post-image-files") return addPostImages(event.target.files);
      saveFilters();
    });
    root.addEventListener("input", (event) => {
      if (event.target.matches("textarea[data-specified-reply]")) updateSpecifiedRowLabels();
      if (event.target.matches("textarea[data-post-content]")) updatePostContentLabels();
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "XRC_JOB_TICK") return;
      for (const wake of [...delayWaiters]) wake();
      renewOwnedLeases();
      restorePersistedJobIfIdle();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      for (const wake of [...delayWaiters]) wake();
      restorePersistedJobIfIdle();
    });
    const saved = await chrome.storage.local.get(["autoJob", "postJob", "autoLastStatus", "postLastStatus", "repliedTweetUrls", "collectJob", "replyLoopJob"]);
    const storedRepliedUrls = Array.isArray(saved.repliedTweetUrls) ? saved.repliedTweetUrls : [];
    const normalizedRepliedUrls = [...new Set(storedRepliedUrls.map(normalizeTweetUrl).filter(Boolean))].slice(-5000);
    state.repliedUrls = new Set(normalizedRepliedUrls);
    if (normalizedRepliedUrls.length !== storedRepliedUrls.length ||
        normalizedRepliedUrls.some((value, index) => value !== storedRepliedUrls[index])) {
      await chrome.storage.local.set({ repliedTweetUrls: normalizedRepliedUrls });
    }
    if (saved.autoLastStatus) { toast(localizeText(saved.autoLastStatus)); await chrome.storage.local.remove("autoLastStatus"); }
    if (saved.postLastStatus) { toast(localizeText(saved.postLastStatus)); await chrome.storage.local.remove("postLastStatus"); }
    if (saved.autoJob?.active && ownsJob(saved.autoJob)) resumeAutoJob(saved.autoJob);
    else if (saved.postJob?.active && ownsJob(saved.postJob)) resumePostJob(saved.postJob);
    else if (saved.collectJob?.active && ownsJob(saved.collectJob)) resumeCollectionJob(saved.collectJob);
    else if (saved.replyLoopJob?.active && ownsJob(saved.replyLoopJob)) resumeReplyLoop(saved.replyLoopJob);
  }

  function fillForm() {
    const setVal = (id, val) => { const el = byId(id); if (el) el.value = val; };
    const setChk = (id, val) => { const el = byId(id); if (el) el.checked = val; };
    setVal("xrc-authors", state.settings.authors);
    setVal("xrc-keywords", state.settings.keywords);
    setVal("xrc-target-urls", state.settings.targetUrls);
    setVal("xrc-direct-repeat-count", state.settings.directTargetRepeatCount);
    setVal("xrc-collect-limit", state.settings.accountCollectLimit);
    setVal("xrc-loop-mode", state.settings.loopMode);
    setVal("xrc-loop-total", state.settings.loopTotalLimit);
    setVal("xrc-loop-round", state.settings.loopRoundLimit);
    setVal("xrc-loop-interval", state.settings.loopRoundIntervalMinutes);
    setVal("xrc-loop-empty", state.settings.loopEmptyRoundLimit);
    setVal("xrc-likes", state.settings.minLikes);
    setVal("xrc-days", state.settings.maxAgeDays);
    setVal("xrc-sort", state.settings.sortBy);
    setChk("xrc-replies", state.settings.excludeReplies);
    setChk("xrc-quotes", state.settings.excludeQuotes);
    setChk("xrc-repeat", state.settings.replyAlreadyReplied);
    setChk("xrc-strict-keyword", state.settings.strictKeywordBody);
    setVal("xrc-key", state.settings.apiKey || "");
    setVal("xrc-base", state.settings.apiBase);
    setVal("xrc-model", state.settings.model);
    setVal("xrc-source", state.settings.replySource);
    renderSpecifiedRows(parseSpecifiedReplies(state.settings.specifiedReplies, false));
    setVal("xrc-specified-order", state.settings.specifiedReplyOrder);
    setVal("xrc-mode", state.settings.replyMode);
    setVal("xrc-prompt", state.settings.customPrompt);
    setVal("xrc-maxchars", state.settings.maxChars);
    setVal("xrc-suggestions", state.settings.suggestionCount);
    setVal("xrc-autocount", state.settings.autoReplyCount);
    setChk("xrc-auto-like-reply", state.settings.autoLikeReply);
    setVal("xrc-delay", state.settings.autoDelaySeconds);
    setVal("xrc-delaymode", state.settings.delayMode);
    setVal("xrc-delay-min", state.settings.randomDelayMin);
    setVal("xrc-delay-max", state.settings.randomDelayMax);
    setVal("xrc-image-chance", state.settings.imageUseChance);
    setVal("xrc-image-count", clamp(state.settings.imageCount || 1, 1, 4, 1));
    setVal("xrc-image-selection", state.settings.imageSelectionMode || "random");
    setChk("xrc-active-hours-enabled", state.settings.activeHoursEnabled);
    setVal("xrc-active-start", state.settings.activeHourStart);
    setVal("xrc-active-end", state.settings.activeHourEnd);
    setVal("xrc-reply-hour-limit", state.settings.replyHourlyLimit);
    setVal("xrc-reply-day-limit", state.settings.replyDailyLimit);
    setVal("xrc-failure-limit", state.settings.consecutiveFailureLimit);
    setChk("xrc-safeguards-enabled", state.settings.safeguardsEnabled);
    renderImageLibrary();
    setVal("xrc-post-source", state.settings.postSource);
    renderPostContentRows(parseSpecifiedReplies(state.settings.postSpecifiedContents, false));
    setVal("xrc-post-specified-order", state.settings.postSpecifiedOrder);
    setVal("xrc-post-prompt", state.settings.postAiPrompt);
    setVal("xrc-post-maxchars", state.settings.postMaxChars);
    setVal("xrc-post-count", state.settings.autoPostCount);
    setChk("xrc-auto-like-post", state.settings.autoLikePost);
    setChk("xrc-post-loop-enabled", state.settings.postLoopEnabled);
    setVal("xrc-post-loop-total", state.settings.postLoopTotalLimit);
    setVal("xrc-post-loop-interval", state.settings.postLoopRoundIntervalMinutes);
    setVal("xrc-post-loop-empty", state.settings.postLoopEmptyRoundLimit);
    setVal("xrc-post-delaymode", state.settings.postDelayMode);
    setVal("xrc-post-delay", state.settings.postDelaySeconds);
    setVal("xrc-post-delay-min", state.settings.postRandomDelayMin);
    setVal("xrc-post-delay-max", state.settings.postRandomDelayMax);
    setVal("xrc-post-image-chance", state.settings.postImageUseChance);
    setVal("xrc-post-image-count", clamp(state.settings.postImageCount || 1, 1, 4, 1));
    setVal("xrc-post-image-selection", state.settings.postImageSelectionMode || "random");
    setVal("xrc-post-hour-limit", state.settings.postHourlyLimit);
    setVal("xrc-post-day-limit", state.settings.postDailyLimit);
    setVal("xrc-post-destination", state.settings.postDestination);
    setVal("xrc-post-community", state.settings.postCommunity);
    renderPostImageLibrary();
    updateDelayModeUi();
    updateReplySourceUi();
    updatePostDelayModeUi();
    updatePostSourceUi();
    updatePostDestinationUi();
    updateSafeguardsUi();
  }

  async function onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const tab = button.dataset.tab;
    if (tab) return switchTab(tab);
    const act = button.dataset.act;
    if (act === "toggle-language") return toggleLanguage();
    if (act === "min") return root.classList.toggle("minimized");
    if (act === "close") return root.remove();
    if (act === "scan") return scan();
    if (act === "search") return openSearch();
    if (act === "load-targets") return loadSpecificPosts();
    if (act === "collect-account") return startAccountCollection();
    if (act === "collect-search") return startKeywordCollection();
    if (act === "start-loop") return startReplyLoop();
    if (act === "pause-loop") return toggleReplyLoopPaused();
    if (act === "stop-loop") return stopReplyLoop();
    if (act === "stop-collect") {
      state.collectStop = true;
      const saved = await chrome.storage.local.get("collectJob");
      if (saved.collectJob) await chrome.storage.local.set({ collectJob: { ...saved.collectJob, active: false, stoppedAt: Date.now() } });
      button.textContent = localizeText("正在停止…"); button.disabled = true;
      return;
    }
    if (act === "save") return saveAll();
    if (act === "save-reply-profile") return saveReplyProfile();
    if (act === "load-reply-profile") return loadReplyProfile();
    if (act === "delete-reply-profile") return deleteReplyProfile();
    if (act === "save-post") return savePostSettings();
    if (act === "save-post-profile") return savePostProfile();
    if (act === "load-post-profile") return loadPostProfile();
    if (act === "delete-post-profile") return deletePostProfile();
    if (act === "add-post-content") return addPostContentRow();
    if (act === "toggle-post-bulk-import") return togglePostBulkImport(true);
    if (act === "cancel-post-bulk-import") return togglePostBulkImport(false, true);
    if (act === "import-post-contents") return importPostContents();
    if (act === "remove-post-content") return removePostContentRow(button);
    if (act === "remove-post-image") return removePostImage(Number(button.dataset.index));
    if (act === "start-post") return startAutoPost().catch((error) => toast(`发帖任务启动失败：${error.message}`, true));
    if (act === "pause-post") return setPostJobPaused(true);
    if (act === "resume-post") return setPostJobPaused(false);
    if (act === "cancel-post") return cancelPostJob();
    if (act === "open") return window.open(button.dataset.url, "_blank");
    if (act === "details") return showDetails(Number(button.dataset.index));
    if (act === "fill") return fillReply(Number(button.dataset.index), Number(button.dataset.reply));
    if (act === "add-specified") return addSpecifiedRow();
    if (act === "toggle-reply-bulk-import") return toggleReplyBulkImport(true);
    if (act === "cancel-reply-bulk-import") return toggleReplyBulkImport(false, true);
    if (act === "import-reply-contents") return importReplyContents();
    if (act === "remove-specified") return removeSpecifiedRow(button);
    if (act === "remove-image") return removeImage(Number(button.dataset.index));
    if (act === "auto") return startAutoReply().catch((error) => { state.autoConfirm = false; state.autoStatus = `启动失败：${error.message}`; renderList(); toast(state.autoStatus, true); });
    if (act === "stop-auto") { state.autoStop = true; state.autoStatus = "正在停止…"; return renderList(); }
    if (act === "cancel-job") return cancelAutoJob();
    if (act === "pause-job") return setAutoJobPaused(true);
    if (act === "resume-job") return setAutoJobPaused(false);
    if (act === "back") return closeDetails();
  }

  function switchTab(tab) {
    root.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    root.querySelectorAll(".xrc-view").forEach((v) => v.classList.toggle("active", v.dataset.view === tab));
    closeDetails();
  }

  function currentFilters() {
    return {
      authors: byId("xrc-authors").value.trim(), keywords: byId("xrc-keywords").value.trim(), targetUrls: byId("xrc-target-urls").value.trim(), directTargetRepeatCount: clamp(byId("xrc-direct-repeat-count").value, 1, 100, 1), accountCollectLimit: clamp(byId("xrc-collect-limit").value, 20, 2000, 300),
      loopMode: byId("xrc-loop-mode").value, loopTotalLimit: clamp(byId("xrc-loop-total").value, 1, 10000, 100), loopRoundLimit: clamp(byId("xrc-loop-round").value, 1, 2000, 50), loopRoundIntervalMinutes: clamp(byId("xrc-loop-interval").value, 1, 1440, 5), loopEmptyRoundLimit: clamp(byId("xrc-loop-empty").value, 1, 20, 3),
      minLikes: Math.max(0, Number(byId("xrc-likes").value) || 0), maxAgeDays: Math.max(1, Number(byId("xrc-days").value) || 7),
      excludeReplies: byId("xrc-replies").checked, excludeQuotes: byId("xrc-quotes").checked, replyAlreadyReplied: byId("xrc-repeat").checked, strictKeywordBody: byId("xrc-strict-keyword").checked, sortBy: byId("xrc-sort").value
    };
  }

  async function saveFilters() { Object.assign(state.settings, currentFilters()); await chrome.storage.local.set(currentFilters()); }

  async function saveAll() {
    let randomDelayMin = clamp(byId("xrc-delay-min").value, 1, 600, 10);
    let randomDelayMax = clamp(byId("xrc-delay-max").value, 1, 600, 30);
    if (randomDelayMin > randomDelayMax) [randomDelayMin, randomDelayMax] = [randomDelayMax, randomDelayMin];
    const values = { ...currentFilters(), apiKey: byId("xrc-key").value.trim(), apiBase: byId("xrc-base").value.trim() || DEFAULTS.apiBase, model: byId("xrc-model").value.trim() || DEFAULTS.model, replySource: byId("xrc-source").value, specifiedReplies: getSpecifiedRowValues(), specifiedReplyOrder: byId("xrc-specified-order").value, replyMode: byId("xrc-mode").value, customPrompt: byId("xrc-prompt").value.trim(), maxChars: clamp(byId("xrc-maxchars").value, 20, 280, 280), suggestionCount: clamp(byId("xrc-suggestions").value, 1, 10, 5), autoReplyCount: clamp(byId("xrc-autocount").value, 1, 2000, 3), autoDelaySeconds: clamp(byId("xrc-delay").value, 1, 600, 10), delayMode: byId("xrc-delaymode").value, randomDelayMin, randomDelayMax, imageUseChance: clamp(byId("xrc-image-chance").value, 0, 100, 50), imageCount: clamp(byId("xrc-image-count").value, 1, 4, 1), imageSelectionMode: byId("xrc-image-selection").value || "random", autoLikeReply: byId("xrc-auto-like-reply").checked, safeguardsEnabled: byId("xrc-safeguards-enabled").checked, activeHoursEnabled: byId("xrc-active-hours-enabled").checked, activeHourStart: byId("xrc-active-start").value || DEFAULTS.activeHourStart, activeHourEnd: byId("xrc-active-end").value || DEFAULTS.activeHourEnd, replyHourlyLimit: clamp(byId("xrc-reply-hour-limit").value, 1, 1000, DEFAULTS.replyHourlyLimit), replyDailyLimit: clamp(byId("xrc-reply-day-limit").value, 1, 10000, DEFAULTS.replyDailyLimit), postHourlyLimit: clamp(byId("xrc-post-hour-limit").value, 1, 1000, DEFAULTS.postHourlyLimit), postDailyLimit: clamp(byId("xrc-post-day-limit").value, 1, 10000, DEFAULTS.postDailyLimit), consecutiveFailureLimit: clamp(byId("xrc-failure-limit").value, 1, 50, DEFAULTS.consecutiveFailureLimit) };
    Object.assign(state.settings, values); await chrome.storage.local.set(values); toast("设置已保存");
  }

  async function savePostSettings() {
    let min = clamp(byId("xrc-post-delay-min").value, 1, 86400, 60);
    let max = clamp(byId("xrc-post-delay-max").value, 1, 86400, 180);
    if (min > max) [min, max] = [max, min];
    const community = normalizeCommunity(byId("xrc-post-community").value);
    const values = {
      postSource: byId("xrc-post-source").value,
      postSpecifiedContents: getPostContentValues(),
      postSpecifiedOrder: byId("xrc-post-specified-order").value,
      postAiPrompt: byId("xrc-post-prompt").value.trim(),
      postMaxChars: clamp(byId("xrc-post-maxchars").value, 20, 280, 280),
      autoPostCount: clamp(byId("xrc-post-count").value, 1, 2000, 3),
      postLoopEnabled: byId("xrc-post-loop-enabled").checked,
      postLoopTotalLimit: clamp(byId("xrc-post-loop-total").value, 1, 10000, 100),
      postLoopRoundIntervalMinutes: clamp(byId("xrc-post-loop-interval").value, 1, 1440, 5),
      postLoopEmptyRoundLimit: clamp(byId("xrc-post-loop-empty").value, 1, 20, 3),
      postDelayMode: byId("xrc-post-delaymode").value,
      postDelaySeconds: clamp(byId("xrc-post-delay").value, 1, 86400, 60),
      postRandomDelayMin: min,
      postRandomDelayMax: max,
      postImageUseChance: clamp(byId("xrc-post-image-chance").value, 0, 100, 50),
      postImageCount: clamp(byId("xrc-post-image-count").value, 1, 4, 1),
      postImageSelectionMode: byId("xrc-post-image-selection").value || "random",
      autoLikePost: byId("xrc-auto-like-post").checked,
      postHourlyLimit: clamp(byId("xrc-post-hour-limit").value, 1, 1000, DEFAULTS.postHourlyLimit),
      postDailyLimit: clamp(byId("xrc-post-day-limit").value, 1, 10000, DEFAULTS.postDailyLimit),
      safeguardsEnabled: byId("xrc-safeguards-enabled").checked,
      activeHoursEnabled: byId("xrc-active-hours-enabled").checked,
      activeHourStart: byId("xrc-active-start").value || DEFAULTS.activeHourStart,
      activeHourEnd: byId("xrc-active-end").value || DEFAULTS.activeHourEnd,
      consecutiveFailureLimit: clamp(byId("xrc-failure-limit").value, 1, 50, DEFAULTS.consecutiveFailureLimit),
      postDestination: byId("xrc-post-destination").value,
      postCommunity: community
    };
    if (values.postDestination === "community" && !community) return toast("请输入有效的 X 社区链接或数字 ID", true);
    Object.assign(state.settings, values);
    byId("xrc-post-community").value = community;
    await chrome.storage.local.set(values);
    toast("发帖设置已保存");
    return values;
  }

  function pickProfileSettings(keys) {
    return Object.fromEntries(keys.map((key) => [key, structuredClone(state.settings[key])]));
  }

  async function renderProfileSelectors(replySelected = "", postSelected = "") {
    const stored = await chrome.storage.local.get(["replyProfiles", "postProfiles"]);
    renderProfileSelect("xrc-reply-profile", stored.replyProfiles, replySelected);
    renderProfileSelect("xrc-post-profile", stored.postProfiles, postSelected);
  }

  function renderProfileSelect(id, profiles, selected) {
    const select = byId(id);
    if (!select) return;
    const current = selected || select.value;
    select.replaceChildren(new Option(localizeText("选择已保存方案"), ""));
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      select.append(new Option(profile.name, profile.name));
    }
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  async function saveNamedProfile(kind) {
    const isReply = kind === "reply";
    const nameInput = byId(isReply ? "xrc-reply-profile-name" : "xrc-post-profile-name");
    const name = nameInput?.value.trim();
    if (!name) return toast("请先填写方案名称", true);
    if (isReply) await saveAll();
    else if (!await savePostSettings()) return;
    const storageKey = isReply ? "replyProfiles" : "postProfiles";
    const keys = isReply ? REPLY_PROFILE_KEYS : POST_PROFILE_KEYS;
    const stored = await chrome.storage.local.get(storageKey);
    const profiles = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
    const profile = { name, settings: pickProfileSettings(keys), updatedAt: Date.now() };
    const index = profiles.findIndex((item) => item.name === name);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    await chrome.storage.local.set({ [storageKey]: profiles });
    await renderProfileSelectors(isReply ? name : "", isReply ? "" : name);
    toast(`${isReply ? "评论" : "发帖"}方案“${name}”已保存`);
  }

  async function loadNamedProfile(kind) {
    const isReply = kind === "reply";
    const select = byId(isReply ? "xrc-reply-profile" : "xrc-post-profile");
    const name = select?.value;
    if (!name) return toast("请先选择一个方案", true);
    const storageKey = isReply ? "replyProfiles" : "postProfiles";
    const stored = await chrome.storage.local.get(storageKey);
    const profile = (Array.isArray(stored[storageKey]) ? stored[storageKey] : []).find((item) => item.name === name);
    if (!profile) return toast("没有找到该方案，请刷新后重试", true);
    const imageKey = isReply ? "imageLibrary" : "postImageLibrary";
    const hasImageSnapshot = Object.prototype.hasOwnProperty.call(profile.settings || {}, imageKey);
    const settingsToLoad = {
      ...(profile.settings || {}),
      [imageKey]: hasImageSnapshot && Array.isArray(profile.settings?.[imageKey])
        ? structuredClone(profile.settings[imageKey])
        : []
    };
    Object.assign(state.settings, settingsToLoad);
    await chrome.storage.local.set(settingsToLoad);
    fillForm();
    const nameInput = byId(isReply ? "xrc-reply-profile-name" : "xrc-post-profile-name");
    if (nameInput) nameInput.value = name;
    await renderProfileSelectors(isReply ? name : "", isReply ? "" : name);
    toast(hasImageSnapshot
      ? `已切换到${isReply ? "评论" : "发帖"}方案“${name}”，图片库已同步`
      : `已切换到旧方案“${name}”；该方案没有图片，图片库已清空`);
  }

  async function deleteNamedProfile(kind) {
    const isReply = kind === "reply";
    const select = byId(isReply ? "xrc-reply-profile" : "xrc-post-profile");
    const name = select?.value;
    if (!name) return toast("请先选择要删除的方案", true);
    const storageKey = isReply ? "replyProfiles" : "postProfiles";
    const stored = await chrome.storage.local.get(storageKey);
    const profiles = (Array.isArray(stored[storageKey]) ? stored[storageKey] : []).filter((item) => item.name !== name);
    await chrome.storage.local.set({ [storageKey]: profiles });
    const nameInput = byId(isReply ? "xrc-reply-profile-name" : "xrc-post-profile-name");
    if (nameInput?.value.trim() === name) nameInput.value = "";
    await renderProfileSelectors();
    toast(`方案“${name}”已删除`);
  }

  function saveReplyProfile() { return saveNamedProfile("reply"); }
  function loadReplyProfile() { return loadNamedProfile("reply"); }
  function deleteReplyProfile() { return deleteNamedProfile("reply"); }
  function savePostProfile() { return saveNamedProfile("post"); }
  function loadPostProfile() { return loadNamedProfile("post"); }
  function deletePostProfile() { return deleteNamedProfile("post"); }
  async function syncSelectedProfileImageLibrary(kind) {
    const isReply = kind === "reply";
    const select = byId(isReply ? "xrc-reply-profile" : "xrc-post-profile");
    const name = select?.value;
    if (!name) return;
    const storageKey = isReply ? "replyProfiles" : "postProfiles";
    const imageKey = isReply ? "imageLibrary" : "postImageLibrary";
    const images = Array.isArray(state.settings[imageKey]) ? structuredClone(state.settings[imageKey]) : [];
    const stored = await chrome.storage.local.get(storageKey);
    const profiles = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
    const index = profiles.findIndex((profile) => profile.name === name);
    if (index < 0) return;
    profiles[index] = {
      ...profiles[index],
      settings: { ...(profiles[index].settings || {}), [imageKey]: images },
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [storageKey]: profiles });
  }

  async function openSearch() {
    await saveFilters();
    const query = buildSearchQuery(false);
    if (!query) return;
    location.href = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
  }

  function buildSearchQuery(requireKeyword, includeAuthors = true) {
    const keywords = splitTerms(state.settings.keywords).map(formatSearchTerm);
    const rawAuthors = includeAuthors ? splitTerms(state.settings.authors) : [];
    const validAuthorNames = rawAuthors
      .map((author) => author.replace(/^@/, "").trim())
      .filter((author) => /^[A-Za-z0-9_]{1,15}$/.test(author));
    if (rawAuthors.length !== validAuthorNames.length) {
      toast("作者必须填写 @ 后面的账号 ID，例如 Davincij15，不能填写显示名称", true); return "";
    }
    const authors = validAuthorNames.map((author) => `from:${author}`);
    if (requireKeyword && !keywords.length) { toast("关键词自动采集需要先填写至少一个关键词", true); return ""; }
    if (!keywords.length && !authors.length) { toast("请真正填写作者账号或关键词；灰色示例文字不是已填写内容", true); return ""; }
    const parts = [];
    if (keywords.length) parts.push(keywords.length === 1 ? keywords[0] : `(${keywords.join(" OR ")})`);
    if (authors.length) parts.push(authors.length === 1 ? authors[0] : `(${authors.join(" OR ")})`);
    if (state.settings.minLikes > 0) parts.push(`min_faves:${state.settings.minLikes}`);
    if (state.settings.maxAgeDays > 0) parts.push(`since:${daysAgoDate(state.settings.maxAgeDays)}`);
    if (state.settings.excludeReplies) parts.push("-filter:replies");
    if (state.settings.excludeQuotes) parts.push("-filter:quote");
    return parts.join(" ");
  }

  async function loadSpecificPosts() {
    await saveFilters();
    const raw = String(state.settings.targetUrls || "").split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean);
    const seen = new Set();
    const tweets = [];
    for (const value of raw) {
      try {
        const parsed = new URL(value);
        if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(parsed.hostname)) continue;
        const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
        if (!match) continue;
        const url = `https://x.com/${match[1]}/status/${match[2]}`;
        if (seen.has(url)) continue; seen.add(url);
        tweets.push({ author: match[1], text: "指定帖子：打开详情页后读取原文", likes: 0, views: 0, ageHours: 0, url, alreadyReplied: state.repliedUrls.has(normalizeTweetUrl(url)), isReply: false, isQuote: false, directTarget: true });
      } catch { /* Ignore malformed entries and report the usable count below. */ }
    }
    if (!tweets.length) return toast("没有识别到有效帖子链接，请填写包含 /status/帖子ID 的 X 链接", true);
    state.tweets = tweets;
    renderList(); switchTab("queue");
    const repeats = clamp(state.settings.directTargetRepeatCount, 1, 100, 1);
    toast(`已载入 ${tweets.length} 条指定帖子；每帖 ${repeats} 条，共计划 ${tweets.length * repeats} 条评论`);
  }

  async function scan() {
    await saveFilters();
    const seen = new Set();
    const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')].map(extractTweet).filter(Boolean).filter((t) => !seen.has(t.url) && seen.add(t.url));
    state.tweets = sortTweets(tweets.filter(matchesFilters));
    renderList(); switchTab("queue");
    toast(`已扫描 ${tweets.length} 条，命中 ${state.tweets.length} 条`);
  }

  async function startAccountCollection() {
    if (state.autoRunning || state.collecting) return toast("已有任务正在运行", true);
    await saveFilters();
    const authors = splitTerms(state.settings.authors).map((value) => value.replace(/^@/, "").trim()).filter(Boolean);
    if (authors.length !== 1 || !/^[A-Za-z0-9_]{1,15}$/.test(authors[0])) return toast("自动采集需要在作者账号中只填写一个有效的账号 ID", true);
    const author = authors[0];
    const job = { active: true, mode: "account", author, limit: state.settings.accountCollectLimit, items: [], returnUrl: location.href, startedAt: Date.now(), ownerTabId: state.tabId, accountId: state.accountId, leaseUntil: Date.now() + 90000 };
    await chrome.storage.local.set({ collectJob: job });
    if (location.pathname.toLowerCase() !== `/${author.toLowerCase()}`) { location.href = `https://x.com/${author}`; return; }
    resumeAccountCollection(job);
  }

  async function startKeywordCollection() {
    if (state.autoRunning || state.collecting) return toast("已有任务正在运行", true);
    await saveFilters();
    const query = buildSearchQuery(true, false);
    if (!query) return;
    const job = { active: true, mode: "search", query, limit: state.settings.accountCollectLimit, items: [], returnUrl: location.href, startedAt: Date.now(), ownerTabId: state.tabId, accountId: state.accountId, leaseUntil: Date.now() + 90000 };
    await chrome.storage.local.set({ collectJob: job });
    const targetUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    if (location.pathname !== "/search" || new URLSearchParams(location.search).get("q") !== query) { location.href = targetUrl; return; }
    resumeKeywordCollection(job);
  }

  async function resumeCollectionJob(job) {
    if (!await claimJobLease(job, "collectJob")) return;
    const waitMs = Math.max(0, Number(job?.nextPassAt || 0) - Date.now());
    if (waitMs) {
      const mode = job?.mode === "search" ? "search" : "account";
      updateCollectButtons(`停止采集（等待下一轮，约 ${Math.ceil(waitMs / 1000)} 秒）`, true, mode);
      await resilientDelay(waitMs);
      const latest = (await chrome.storage.local.get("collectJob")).collectJob;
      if (!latest?.active) return finishStoppedCollection(latest || job);
      if (!ownsJob(latest)) return updateCollectButtons("", false);
      job = latest;
    }
    return job?.mode === "search" ? resumeKeywordCollection(job) : resumeAccountCollection(job);
  }

  async function waitUntilLoopCollectionResumed(job) {
    if (!job?.loop) return !state.collectStop;
    while (!state.collectStop) {
      const loop = (await chrome.storage.local.get("replyLoopJob")).replyLoopJob;
      if (!loop?.active) return false;
      if (!loop.paused) return true;
      await resilientDelay(500);
    }
    return false;
  }

  async function resumeAccountCollection(job) {
    if (!job?.active || state.collecting) return;
    state.collecting = true; state.collectStop = false;
    updateCollectButtons("停止账号采集", true, "account");
    const collected = new Map((job.items || []).map((tweet) => [normalizeTweetUrl(tweet.url), tweet]));
    let validItems = summarizeCollectedAccountResults([...collected.values()], job.author);
    const passStartSize = collected.size;
    let staleRounds = 0, rounds = 0, reachedBottom = false, ageBoundaryRounds = 0, reachedAgeBoundary = false;
    const bottomTracker = createCollectionBottomTracker();
    window.scrollTo({ top: 0, behavior: "auto" }); await delay(1200);
    while (!state.collectStop && validItems.length < job.limit) {
      if (!await waitUntilLoopCollectionResumed(job)) break;
      let added = 0;
      for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
        const tweet = extractTweet(article);
        if (!tweet || tweet.author.toLowerCase() !== job.author.toLowerCase()) continue;
        const key = normalizeTweetUrl(tweet.url);
        if (collected.has(key)) continue;
        collected.set(key, serializableTweet(tweet)); added += 1;
      }
      if (added) validItems = summarizeCollectedAccountResults([...collected.values()], job.author);
      staleRounds = added ? 0 : staleRounds + 1; rounds += 1;
      reachedBottom = updateCollectionBottomTracker(bottomTracker, added);
      ageBoundaryRounds = accountTimelinePastAgeLimit(job.author) ? ageBoundaryRounds + 1 : 0;
      reachedAgeBoundary = ageBoundaryRounds >= 3;
      updateCollectButtons(`停止账号采集（有效 ${Math.min(validItems.length, job.limit)}/${job.limit}，已扫描 ${collected.size}）`, true, "account");
      if (rounds % 5 === 0 || added) {
        job.items = [...collected.values()];
        await chrome.storage.local.set({ collectJob: job });
      }
      if (validItems.length >= job.limit) break;
      // Account timelines are reverse chronological. Once several consecutive
      // viewport checks contain only posts older than the configured age
      // window, scrolling farther cannot produce another valid recent post.
      if (reachedAgeBoundary) break;
      if (reachedBottom || staleRounds >= 40) {
        return continueCollectionUntilValid(job, collected, validItems.length, passStartSize, "account");
      }
      scrollCollectionPage(rounds);
      await resilientDelay(900);
    }
    const stoppedByUser = state.collectStop;
    job.items = [...collected.values()];
    job.reachedBottom = reachedBottom;
    job.reachedAgeBoundary = reachedAgeBoundary;
    await chrome.storage.local.remove("collectJob");
    state.collecting = false; state.collectStop = false;
    updateCollectButtons("", false);
    validItems = summarizeCollectedAccountResults(job.items, job.author);
    state.tweets = sortTweets(validItems).slice(0, job.limit);
    renderList(); switchTab("queue");
    if (job.loop) return handleLoopCollectionComplete(job, state.tweets);
    const reason = state.tweets.length >= job.limit
      ? `已达到有效采集上限 ${job.limit} 条`
      : stoppedByUser
        ? "已手动停止"
        : reachedAgeBoundary
          ? `已到达最近 ${state.settings.maxAgeDays} 天的日期边界`
          : "采集任务已结束";
    const statsMsg = buildAccountStatsMessage(validItems);
    const hint = state.tweets.length < 5 ? `（可尝试：降低点赞门槛、取消排除回复/引用、增加天数范围）` : "";
    toast(`${reason}；实际扫描 ${collected.size} 条，保留 ${state.tweets.length} 条${statsMsg}${hint}`);
  }

  function buildAccountStatsMessage(validItems) {
    const stats = validItems._stats;
    if (!stats) return "";
    const parts = [];
    if (stats.tooOld) parts.push(`太旧 ${stats.tooOld}`);
    if (stats.lowLikes) parts.push(`赞不够 ${stats.lowLikes}`);
    if (stats.replies) parts.push(`Reply ${stats.replies}`);
    if (stats.quotes) parts.push(`Quote ${stats.quotes}`);
    if (stats.alreadyReplied) parts.push(`已回复 ${stats.alreadyReplied}`);
    if (stats.keywordMisses) parts.push(`关键词未命中 ${stats.keywordMisses}`);
    if (stats.noAuthor) parts.push(`作者不符 ${stats.noAuthor}`);
    return parts.length ? `（排除：${parts.join("、")}）` : "";
  }

  async function resumeKeywordCollection(job) {
    if (!job?.active || state.collecting) return;
    state.collecting = true; state.collectStop = false;
    updateCollectButtons("停止关键词采集", true, "search");
    const collected = new Map((job.items || []).map((tweet) => [normalizeTweetUrl(tweet.url), tweet]));
    let summary = summarizeCollectedSearchResults([...collected.values()]);
    const passStartSize = collected.size;
    let staleRounds = 0, rounds = 0, reachedBottom = false;
    const bottomTracker = createCollectionBottomTracker();
    window.scrollTo({ top: 0, behavior: "auto" }); await delay(1200);
    while (!state.collectStop && summary.kept.length < job.limit) {
      if (!await waitUntilLoopCollectionResumed(job)) break;
      let added = 0;
      for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
        const tweet = extractTweet(article); if (!tweet) continue;
        const key = normalizeTweetUrl(tweet.url);
        if (collected.has(key)) continue;
        collected.set(key, serializableTweet(tweet)); added += 1;
      }
      if (added) summary = summarizeCollectedSearchResults([...collected.values()]);
      staleRounds = added ? 0 : staleRounds + 1; rounds += 1;
      reachedBottom = updateCollectionBottomTracker(bottomTracker, added);
      updateCollectButtons(`停止关键词采集（有效 ${Math.min(summary.kept.length, job.limit)}/${job.limit}，已扫描 ${collected.size}）`, true, "search");
      if (rounds % 5 === 0 || added) { job.items = [...collected.values()]; await chrome.storage.local.set({ collectJob: job }); }
      if (summary.kept.length >= job.limit) break;
      if (reachedBottom || staleRounds >= 40) {
        return continueCollectionUntilValid(job, collected, summary.kept.length, passStartSize, "search");
      }
      scrollCollectionPage(rounds);
      await resilientDelay(900);
    }
    const stoppedByUser = state.collectStop;
    job.items = [...collected.values()];
    job.reachedBottom = reachedBottom;
    await chrome.storage.local.remove("collectJob");
    state.collecting = false; state.collectStop = false;
    updateCollectButtons("", false);
    summary = summarizeCollectedSearchResults(job.items);
    state.tweets = sortTweets(summary.kept).slice(0, job.limit);
    job.resultSummary = {
      scanned: collected.size,
      kept: state.tweets.length,
      keywordMisses: summary.keywordMisses,
      replies: summary.replies,
      quotes: summary.quotes,
      alreadyReplied: summary.alreadyReplied,
      lowLikes: summary.lowLikes,
      tooOld: summary.tooOld,
      noAuthor: summary.noAuthor
    };
    renderList(); switchTab("queue");
    if (job.loop) return handleLoopCollectionComplete(job, state.tweets);
    const reason = state.tweets.length >= job.limit ? `已达到有效采集上限 ${job.limit} 条` : stoppedByUser ? "已手动停止" : reachedBottom ? "已滚动到页面底部" : "搜索页已连续多轮没有加载新帖子";
    toast(`${reason}；X 实际加载 ${collected.size} 条，保留 ${state.tweets.length} 条（正文未命中 ${summary.keywordMisses}、Reply ${summary.replies}、Quote ${summary.quotes}、已回复 ${summary.alreadyReplied}、赞不够 ${summary.lowLikes}、太旧 ${summary.tooOld}${summary.noAuthor ? `、作者不符 ${summary.noAuthor}` : ""}）`);
  }

  function summarizeCollectedAccountResults(items, author) {
    const normalizedAuthor = String(author || "").toLowerCase();
    const hasKeywords = splitTerms(state.settings.keywords).length > 0;
    const stats = { kept: [], tooOld: 0, lowLikes: 0, replies: 0, quotes: 0, alreadyReplied: 0, keywordMisses: 0, noAuthor: 0 };
    const arr = Array.isArray(items) ? items : [];
    for (const tweet of arr) {
      if (String(tweet?.author || "").toLowerCase() !== normalizedAuthor) { stats.noAuthor += 1; continue; }
      if (hasKeywords) {
        const fullMatch = matchesFilters(tweet);
        const relaxedMatch = tweet.likes >= state.settings.minLikes &&
          tweet.ageHours <= state.settings.maxAgeDays * 24 &&
          (!state.settings.excludeReplies || !tweet.isReply) &&
          (!state.settings.excludeQuotes || !tweet.isQuote) &&
          (state.settings.replyAlreadyReplied || !tweet.alreadyReplied);
        if (fullMatch) { tweet._keywordMatch = true; stats.kept.push(tweet); continue; }
        if (relaxedMatch) { tweet._keywordMatch = false; stats.kept.push(tweet); continue; }
        // 详细统计被排除原因
        if (tweet.ageHours > state.settings.maxAgeDays * 24) stats.tooOld += 1;
        if (tweet.likes < state.settings.minLikes) stats.lowLikes += 1;
        if (state.settings.excludeReplies && tweet.isReply) stats.replies += 1;
        if (state.settings.excludeQuotes && tweet.isQuote) stats.quotes += 1;
        if (!state.settings.replyAlreadyReplied && tweet.alreadyReplied) stats.alreadyReplied += 1;
        if (!tweetTextMatchesKeywords(tweet.text, state.settings.keywords)) stats.keywordMisses += 1;
        continue;
      }
      // 无关键词时做详细的逐项统计
      if (tweet.ageHours > state.settings.maxAgeDays * 24) { stats.tooOld += 1; continue; }
      if (tweet.likes < state.settings.minLikes) { stats.lowLikes += 1; continue; }
      if (state.settings.excludeReplies && tweet.isReply) { stats.replies += 1; continue; }
      if (state.settings.excludeQuotes && tweet.isQuote) { stats.quotes += 1; continue; }
      if (!state.settings.replyAlreadyReplied && tweet.alreadyReplied) { stats.alreadyReplied += 1; continue; }
      stats.kept.push(tweet);
    }
    // 将 stats 挂到返回值上，调用方可通过 ._stats 获取明细
    stats.kept._stats = stats;
    return stats.kept;
  }

  function accountTimelinePastAgeLimit(author) {
    const maxAgeHours = Math.max(0, Number(state.settings.maxAgeDays || 0)) * 24;
    if (!maxAgeHours) return false;
    const normalizedAuthor = String(author || "").toLowerCase();
    const datedTweets = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .map(extractTweet)
      .filter((tweet) =>
        tweet &&
        String(tweet.author || "").toLowerCase() === normalizedAuthor &&
        tweet.published &&
        Number.isFinite(tweet.ageHours)
      );
    // Requiring at least two dated posts and three consecutive checks avoids
    // treating a single old pinned post at the top of a profile as the cutoff.
    return datedTweets.length >= 2 && datedTweets.every((tweet) => tweet.ageHours > maxAgeHours);
  }

  async function continueCollectionUntilValid(job, collected, validCount, passStartSize, mode) {
    const madeProgress = collected.size > passStartSize;
    job.items = [...collected.values()];
    job.pass = Number(job.pass || 0) + 1;
    job.noProgressPasses = madeProgress ? 0 : Number(job.noProgressPasses || 0) + 1;
    // 连续 3 轮重载都没有扫到任何新帖子 → 页面已经到底，不再徒劳重试
    if (job.noProgressPasses >= 3) {
      await chrome.storage.local.remove("collectJob");
      state.collecting = false; state.collectStop = false;
      updateCollectButtons("", false);
      const validItems = mode === "search"
        ? summarizeCollectedSearchResults(job.items).kept
        : summarizeCollectedAccountResults(job.items, job.author);
      state.tweets = sortTweets(validItems).slice(0, job.limit);
      renderList(); switchTab("queue");
      if (job.loop) return handleLoopCollectionComplete(job, state.tweets);
      const filterHints = [];
      if (state.settings.minLikes > 0) filterHints.push(`点赞门槛 ${state.settings.minLikes}`);
      if (state.settings.excludeReplies) filterHints.push("排除了回复帖");
      if (state.settings.excludeQuotes) filterHints.push("排除了引用帖");
      if (state.settings.maxAgeDays < 365) filterHints.push(`仅保留 ${state.settings.maxAgeDays} 天内`);
      const hint = filterHints.length ? `；可尝试：降低点赞门槛、取消排除回复/引用、或增加天数范围` : "";
      return toast(`已扫描 ${collected.size} 条，命中 ${state.tweets.length} 条（已触底且连续重载无新帖）${hint}`);
    }
    // A page bottom is only the end of the current loading pass. Keep the
    // deduplicated scan cache and retry until the configured valid target is
    // reached or the user presses Stop. Back off when X returns no new posts.
    const delaySeconds = Math.min(180, 10 + job.noProgressPasses * 15);
    job.nextPassAt = Date.now() + delaySeconds * 1000;
    job.reachedBottom = false;
    job.leaseUntil = Date.now() + 90000;
    await chrome.storage.local.set({ collectJob: job });
    state.collecting = false;
    updateCollectButtons(`停止${mode === "search" ? "关键词" : "账号"}采集（有效 ${validCount}/${job.limit}，已扫描 ${collected.size}；${delaySeconds} 秒后重试 ${job.noProgressPasses + 1}/3）`, true, mode);
    await resilientDelay(Math.min(delaySeconds * 1000, 1500));
    const latest = (await chrome.storage.local.get("collectJob")).collectJob;
    if (!latest?.active || state.collectStop) {
      await chrome.storage.local.remove("collectJob");
      state.collecting = false; state.collectStop = false;
      updateCollectButtons("", false);
      const validItems = mode === "search"
        ? summarizeCollectedSearchResults(job.items).kept
        : summarizeCollectedAccountResults(job.items, job.author);
      state.tweets = sortTweets(validItems).slice(0, job.limit);
      renderList(); switchTab("queue");
      if (job.loop) return handleLoopCollectionComplete(job, state.tweets);
      return toast(`已手动停止；实际扫描 ${collected.size} 条，保留 ${state.tweets.length} 条`);
    }
    location.reload();
  }

  async function finishStoppedCollection(job) {
    await chrome.storage.local.remove("collectJob");
    state.collecting = false; state.collectStop = false;
    updateCollectButtons("", false);
    const items = Array.isArray(job?.items) ? job.items : [];
    const validItems = job?.mode === "search"
      ? summarizeCollectedSearchResults(items).kept
      : summarizeCollectedAccountResults(items, job?.author);
    state.tweets = sortTweets(validItems).slice(0, Number(job?.limit || validItems.length));
    renderList(); switchTab("queue");
    if (job?.loop) return handleLoopCollectionComplete(job, state.tweets);
    toast(`已手动停止；实际扫描 ${items.length} 条，保留 ${state.tweets.length} 条`);
  }

  function serializableTweet(tweet) {
    const { article, ...plain } = tweet;
    return plain;
  }

  function scrollCollectionPage(round) {
    const distance = Math.max(window.innerHeight * (round % 8 === 0 ? 1.8 : 1.05), 900);
    window.scrollBy({ top: distance, behavior: "auto" });
  }

  function createCollectionBottomTracker() {
    const scroller = document.scrollingElement || document.documentElement;
    return { lastHeight: scroller?.scrollHeight || 0, stableRounds: 0 };
  }

  function updateCollectionBottomTracker(tracker, added) {
    const scroller = document.scrollingElement || document.documentElement;
    if (!scroller) return false;
    const height = Math.max(scroller.scrollHeight || 0, document.body?.scrollHeight || 0);
    const atBottom = scroller.scrollTop + scroller.clientHeight >= height - 160;
    const heightGrew = height > tracker.lastHeight + 80;
    tracker.stableRounds = atBottom && !added && !heightGrew ? tracker.stableRounds + 1 : 0;
    tracker.lastHeight = height;
    return tracker.stableRounds >= 4;
  }

  function matchesCollectedSearchResult(tweet) {
    // The X search query has already applied keyword, min_faves and since.
    // Body-only verification is optional because enforcing it can discard
    // legitimate results whose keyword is represented by a hashtag or card.
    return (!state.settings.strictKeywordBody || tweetTextMatchesKeywords(tweet.text, state.settings.keywords)) &&
      (!state.settings.excludeReplies || !tweet.isReply) &&
      (!state.settings.excludeQuotes || !tweet.isQuote) &&
      (state.settings.replyAlreadyReplied || !tweet.alreadyReplied);
  }

  function summarizeCollectedSearchResults(items) {
    const summary = { kept: [], keywordMisses: 0, replies: 0, quotes: 0, alreadyReplied: 0, lowLikes: 0, tooOld: 0, noAuthor: 0 };
    const hasAuthors = splitTerms(state.settings.authors).length > 0;
    const authorSet = new Set(splitTerms(state.settings.authors).map((x) => x.replace(/^@/, "").toLowerCase()));
    for (const tweet of Array.isArray(items) ? items : []) {
      if (!tweet?.url) continue; // 无效条目跳过
      if (state.settings.strictKeywordBody && !tweetTextMatchesKeywords(tweet.text, state.settings.keywords)) { summary.keywordMisses += 1; continue; }
      if (state.settings.excludeReplies && tweet.isReply) { summary.replies += 1; continue; }
      if (state.settings.excludeQuotes && tweet.isQuote) { summary.quotes += 1; continue; }
      if (!state.settings.replyAlreadyReplied && tweet.alreadyReplied) { summary.alreadyReplied += 1; continue; }
      // X 搜索参数 min_faves / since 并非 100% 可靠，本地做兜底校验
      if (tweet.likes < state.settings.minLikes) { summary.lowLikes += 1; continue; }
      if (tweet.ageHours > state.settings.maxAgeDays * 24) { summary.tooOld += 1; continue; }
      if (hasAuthors && !authorSet.has(String(tweet.author || "").toLowerCase())) { summary.noAuthor += 1; continue; }
      summary.kept.push(tweet);
    }
    return summary;
  }

  async function startReplyLoop() {
    const filters = currentFilters();
    await saveFilters();
    if (state.autoRunning || state.postRunning || state.collecting) return toast("请先结束当前评论、发帖或采集任务", true);
    const activeJobs = await chrome.storage.local.get(["replyLoopJob", "postJob"]);
    const existing = activeJobs.replyLoopJob;
    if (existing?.active) return toast("已有循环评论任务，请先终止", true);
    if (activeJobs.postJob?.active) return toast("请先结束自动发帖任务", true);
    if (filters.loopMode === "search" && !splitTerms(filters.keywords).length) return toast("关键词循环需要填写关键词", true);
    const authors = splitTerms(filters.authors).map((value) => value.replace(/^@/, "").trim()).filter(Boolean);
    if (filters.loopMode === "account" && (authors.length !== 1 || !/^[A-Za-z0-9_]{1,15}$/.test(authors[0]))) return toast("账号循环需要填写一个有效账号 ID", true);
    const job = {
      active: true, paused: false, mode: filters.loopMode, totalLimit: filters.loopTotalLimit,
      roundLimit: filters.loopRoundLimit, intervalMinutes: filters.loopRoundIntervalMinutes,
      emptyRoundLimit: filters.loopEmptyRoundLimit, sent: 0, skipped: 0, rounds: 0,
      emptyRounds: 0, author: authors[0] || "", keywords: filters.keywords,
      homeUrl: location.href, ownerTabId: state.tabId, accountId: state.accountId, leaseUntil: Date.now() + 90000, startedAt: Date.now(), phase: "collecting"
    };
    await chrome.storage.local.set({ replyLoopJob: job });
    updateReplyLoopStatus(job, "正在启动第 1 轮采集…");
    return beginReplyLoopRound(job);
  }

  async function beginReplyLoopRound(job) {
    if (!job?.active || job.paused) return;
    if (job.sent >= job.totalLimit) return finishReplyLoop(job, `已达到总发送上限 ${job.totalLimit}`);
    job.phase = "collecting"; job.nextRoundAt = null;
    await chrome.storage.local.set({ replyLoopJob: job });
    const collectJob = {
      active: true, loop: true, mode: job.mode, limit: job.roundLimit, items: [],
      returnUrl: location.href, startedAt: Date.now(), ownerTabId: state.tabId, accountId: state.accountId, leaseUntil: Date.now() + 90000
    };
    let targetUrl;
    if (job.mode === "search") {
      Object.assign(state.settings, await chrome.storage.local.get(Object.keys(DEFAULTS)));
      const query = buildSearchQuery(true, false);
      if (!query) return finishReplyLoop(job, "无法建立关键词查询", true);
      collectJob.query = query;
      targetUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    } else {
      // 账号模式也需刷新 settings，确保 maxAgeDays/minLikes 等过滤条件是最新的
      Object.assign(state.settings, await chrome.storage.local.get(Object.keys(DEFAULTS)));
      collectJob.author = job.author;
      targetUrl = `https://x.com/${job.author}`;
    }
    await chrome.storage.local.set({ collectJob });
    if (location.href !== targetUrl) location.href = targetUrl;
    else resumeCollectionJob(collectJob);
  }

  async function handleLoopCollectionComplete(collectJob, tweets) {
    const loop = (await chrome.storage.local.get("replyLoopJob")).replyLoopJob;
    if (!loop?.active) return;
    if (loop.paused) return updateReplyLoopStatus(loop, "循环已暂停，点击“暂停/继续”恢复");
    loop.rounds = (loop.rounds || 0) + 1;
    const candidates = (tweets || []).filter((tweet) => state.settings.replyAlreadyReplied || !tweet.alreadyReplied);
    if (!candidates.length) {
      loop.emptyRounds = (loop.emptyRounds || 0) + 1;
      loop.skipped = (loop.skipped || 0) + (tweets?.length || 0);
      if (collectJob?.reachedBottom) return finishReplyLoop(loop, "已滚动到帖子列表底部，循环自动结束");
      const summary = collectJob?.resultSummary;
      const details = summary
        ? `；扫描 ${summary.scanned} 条，排除：正文未命中 ${summary.keywordMisses}、Reply ${summary.replies}、Quote ${summary.quotes}、已回复 ${summary.alreadyReplied}、赞不够 ${summary.lowLikes}、太旧 ${summary.tooOld}${summary.noAuthor ? `、作者不符 ${summary.noAuthor}` : ""}`
        : "";
      if (loop.emptyRounds >= loop.emptyRoundLimit) return finishReplyLoop(loop, `连续 ${loop.emptyRounds} 轮没有可评论帖子，已自动停止${details}`);
      return scheduleNextReplyLoopRound(loop, `第 ${loop.rounds} 轮没有新候选${details}`);
    }
    loop.emptyRounds = 0;
    loop.phase = "replying";
    loop.stopAfterRound = Boolean(collectJob?.reachedBottom);
    await chrome.storage.local.set({ replyLoopJob: loop });
    state.tweets = sortTweets(candidates);
    renderList();
    const remaining = Math.max(0, loop.totalLimit - loop.sent);
    const input = byId("xrc-auto-run-count");
    if (input) input.value = Math.min(remaining, candidates.length);
    return startAutoReply(true);
  }

  async function scheduleNextReplyLoopRound(loop, reason) {
    loop.phase = "waiting";
    loop.nextRoundAt = Date.now() + Math.max(1, loop.intervalMinutes) * 60000;
    await chrome.storage.local.set({ replyLoopJob: loop });
    updateReplyLoopStatus(loop, `${reason}；等待 ${loop.intervalMinutes} 分钟后继续`);
    return resumeReplyLoop(loop);
  }

  async function resumeReplyLoop(loop) {
    if (!await claimJobLease(loop, "replyLoopJob")) return;
    if (!loop?.active || loop.paused || state.autoRunning || state.collecting || state.postRunning) return;
    updateReplyLoopStatus(loop);
    while (loop.nextRoundAt && Date.now() < loop.nextRoundAt) {
      const latest = (await chrome.storage.local.get("replyLoopJob")).replyLoopJob;
      if (!latest?.active || latest.paused) return;
      Object.assign(loop, latest);
      await resilientDelay(Math.min(1000, loop.nextRoundAt - Date.now()));
    }
    return beginReplyLoopRound(loop);
  }

  async function stopReplyLoop() {
    runningJobs["autoJob"] = null;
    for (const wake of [...delayWaiters]) wake();
    const saved = await chrome.storage.local.get(["replyLoopJob", "autoJob", "collectJob"]);
    await chrome.storage.local.remove(["replyLoopJob", "collectJob"]);
    if (saved.autoJob?.loop) {
      clearAiPrefetch(saved.autoJob._runId);
      await chrome.storage.local.remove("autoJob");
    }
    state.collectStop = true; state.autoStop = true; state.autoRunning = false;
    for (const wake of [...delayWaiters]) wake();
    const currentRoundSent = saved.autoJob?.loop ? (saved.autoJob.sent || 0) : 0;
    const totalSent = (saved.replyLoopJob?.sent || 0) + currentRoundSent;
    updateReplyLoopStatus(null, `循环已终止：发送 ${totalSent} 条`);
    updateJobLoopActions(false);
    showJobBar("");
    toast(`循环已彻底终止：共发送 ${totalSent} 条`);
    await clearReplyEditor();
  }

  async function toggleReplyLoopPaused() {
    const saved = await chrome.storage.local.get(["replyLoopJob", "autoJob"]);
    const loop = saved.replyLoopJob;
    if (!loop?.active) return toast("当前没有循环评论任务", true);
    if (!loop.paused) {
      loop.paused = true;
      loop.resumePhase = loop.phase || (loop.nextRoundAt ? "waiting" : "collecting");
      loop.phase = "paused";
    } else {
      loop.paused = false;
      loop.phase = loop.resumePhase || (loop.nextRoundAt ? "waiting" : (saved.autoJob?.loop ? "replying" : "collecting"));
      delete loop.resumePhase;
    }
    await chrome.storage.local.set({ replyLoopJob: loop });
    if (saved.autoJob?.loop) {
      saved.autoJob.paused = loop.paused;
      await chrome.storage.local.set({ autoJob: saved.autoJob });
    }
    for (const wake of [...delayWaiters]) wake();
    updateReplyLoopStatus(loop, loop.paused ? "循环已暂停" : "循环已继续");
    if (!loop.paused) return resumeReplyLoop(loop);
  }

  async function finishReplyLoop(loop, reason, isError = false) {
    await chrome.storage.local.remove(["replyLoopJob", "collectJob"]);
    updateReplyLoopStatus(null, `${reason}；共发送 ${loop.sent || 0} 条，跳过 ${loop.skipped || 0} 条`);
    toast(`${reason}；共发送 ${loop.sent || 0} 条`, isError);
  }

  function updateReplyLoopStatus(loop, text = "") {
    const node = byId("xrc-loop-status"); if (!node) return;
    const status = text || (loop?.active
      ? `运行中：已发送 ${loop.sent || 0}/${loop.totalLimit}，第 ${loop.rounds || 0} 轮，阶段 ${loop.phase || "准备"}`
      : "达到总上限后自动结束；再次运行必须重新点击开始。");
    node.textContent = localizeText(status);
  }

  function updateCollectButtons(text, running = state.collecting, mode = "") {
    const account = byId("xrc-collect-button"), search = byId("xrc-collect-search-button");
    if (!account || !search) return;
    account.disabled = running && mode === "search"; search.disabled = running && mode === "account";
    account.textContent = localizeText(running && mode === "account" ? text : "自动采集账号帖子");
    search.textContent = localizeText(running && mode === "search" ? text : "自动采集关键词搜索结果（忽略作者栏）");
    account.dataset.act = running && mode === "account" ? "stop-collect" : "collect-account";
    search.dataset.act = running && mode === "search" ? "stop-collect" : "collect-search";
  }

  function extractTweet(article) {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const time = article.querySelector("time");
    const statusLink = time?.closest('a[href*="/status/"]');
    if (!textNode || !statusLink) return null;
    const url = new URL(statusLink.getAttribute("href"), location.origin).href;
    const author = (new URL(url).pathname.split("/")[1] || "").replace(/^@/, "");
    const like = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
    const likes = parseMetric(like?.getAttribute("aria-label") || like?.textContent || "0");
    const view = article.querySelector('a[href*="/analytics"]');
    const views = parseMetric(view?.getAttribute("aria-label") || view?.textContent || "0");
    const published = time.dateTime ? new Date(time.dateTime) : null;
    const ageHours = published ? Math.max(0, (Date.now() - published.getTime()) / 36e5) : 99999;
    const socialContext = article.querySelector('[data-testid="socialContext"]')?.textContent || "";
    // querySelector('[data-testid="tweet"] [data-testid="tweetText"]') also
    // matches the outer article's own text, which incorrectly marks every
    // normal post as a Quote. A real Quote has a dedicated quote container or
    // more than one tweet text block inside the outer article.
    const quoted = Boolean(article.querySelector('[data-testid="quoteTweet"]')) ||
      article.querySelectorAll('[data-testid="tweetText"]').length > 1;
    return { article, text: textNode.innerText.trim(), author, likes, views, published: published?.toISOString(), ageHours, url, alreadyReplied: state.repliedUrls.has(normalizeTweetUrl(url)), isReply: /replying to/i.test(article.innerText), isQuote: quoted || /quote/i.test(socialContext) };
  }

  function readCurrentTweet(fallback) {
    try {
      const statusId = new URL(fallback.url).pathname.split("/").filter(Boolean).pop();
      const article = [...document.querySelectorAll('article[data-testid="tweet"]')].find((item) => item.querySelector(`a[href*="/status/${statusId}"]`));
      const extracted = article ? extractTweet(article) : null;
      return extracted ? { ...extracted, directTarget: fallback.directTarget } : {};
    } catch { return {}; }
  }

  function matchesFilters(tweet) {
    const authors = splitTerms(state.settings.authors).map((x) => x.replace(/^@/, "").toLowerCase());
    return (!authors.length || authors.includes(tweet.author.toLowerCase())) &&
      tweetTextMatchesKeywords(tweet.text, state.settings.keywords) &&
      tweet.likes >= state.settings.minLikes && tweet.ageHours <= state.settings.maxAgeDays * 24 &&
      (!state.settings.excludeReplies || !tweet.isReply) && (!state.settings.excludeQuotes || !tweet.isQuote) &&
      (state.settings.replyAlreadyReplied || !tweet.alreadyReplied);
  }

  function tweetTextMatchesKeywords(text, keywordSetting) {
    const keywords = splitTerms(keywordSetting);
    if (!keywords.length) return true;
    // NFKC 归一化：全角→半角、合字拆解；toLowerCase 避免土耳其语 locale 陷阱
    const body = normalizeComparable(text).normalize("NFKC").toLowerCase();
    return keywords.some((keyword) => {
      const term = normalizeComparable(keyword).normalize("NFKC").toLowerCase();
      if (!term) return false;
      // 在正文中搜索关键词（大小写不敏感）
      let searchFrom = 0;
      while (searchFrom < body.length) {
        const idx = body.indexOf(term, searchFrom);
        if (idx === -1) return false;
        // 检查前后字符，仅排除完全嵌入更长字母数字串的情况
        // 例如 "BTC" 不应匹配 "BTCC" 或 "aBTCa"
        // 但应匹配 "$BTC"、"#BTC"、"_BTC"、"BTC!"、"BTC's" 等
        const charBefore = idx > 0 ? body[idx - 1] : ' ';
        const charAfter = idx + term.length < body.length ? body[idx + term.length] : ' ';
        const isAlphaNum = (ch) => /^[a-z0-9]$/i.test(ch);
        // 仅当两侧都是字母数字时才认为被嵌入 → 跳过继续搜
        if (isAlphaNum(charBefore) && isAlphaNum(charAfter)) {
          searchFrom = idx + 1;
          continue;
        }
        return true;
      }
      return false;
    });
  }

  function sortTweets(tweets) {
    const mode = state.settings.sortBy;
    // 账号采集模式下，关键词命中的帖子优先展示
    const withKeywordFlag = tweets.some((t) => Object.prototype.hasOwnProperty.call(t, "_keywordMatch"));
    const sorted = [...tweets].sort((a, b) => {
      if (withKeywordFlag) {
        const aMatch = a._keywordMatch === true ? 0 : 1;
        const bMatch = b._keywordMatch === true ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      if (mode === "viewsAsc") return (a.views || 0) - (b.views || 0);
      if (mode === "newest") return tweetTimestamp(b) - tweetTimestamp(a);
      if (mode === "oldest") return tweetTimestamp(a) - tweetTimestamp(b);
      if (mode === "likes") return (b.likes || 0) - (a.likes || 0);
      return (b.views || 0) - (a.views || 0);
    });
    // 将排序结果写回原数组
    tweets.length = 0; tweets.push(...sorted);
    return tweets;
  }

  function tweetTimestamp(tweet) {
    const parsed = Date.parse(tweet.published || "");
    if (Number.isFinite(parsed)) return parsed;
    return Date.now() - Math.max(0, Number(tweet.ageHours) || 0) * 36e5;
  }

  function sortDescription(mode) {
    const description = ({ views: "浏览量从高到低", viewsAsc: "浏览量从低到高", newest: "日期从新到旧", oldest: "日期从旧到新", likes: "点赞数从高到低" })[mode] || "浏览量从高到低";
    return localizeText(description);
  }

  function renderList() {
    byId("xrc-count").textContent = state.tweets.length;
    const directRepeatCount = clamp(state.settings.directTargetRepeatCount, 1, 100, 1);
    const directMultiMode = state.tweets.length > 0 && state.tweets.every((tweet) => tweet.directTarget) && directRepeatCount > 1;
    const eligibleCount = directMultiMode
      ? state.tweets.length * directRepeatCount
      : state.settings.replyAlreadyReplied
      ? state.tweets.length
      : state.tweets.filter((tweet) => !tweet.alreadyReplied).length;
    const plannedCount = directMultiMode ? eligibleCount : state.settings.autoReplyCount;
    const autoButtons = state.autoRunning ? `<button class="danger" data-act="stop-auto">${localizeText("停止")}</button>` : `<button data-act="auto">${localizeText("开始")}</button>`;
    const modeDescription = directMultiMode
      ? `${state.tweets.length} ${localizeText("个指定帖子")} × ${localizeText("每帖")} ${directRepeatCount} ${localizeText("条")}`
      : `${localizeText("当前可发送")} ${eligibleCount} ${localizeText("条")} · ${localizeText("按")} ${sortDescription(state.settings.sortBy)} ${localizeText("处理")}`;
    const autoBar = state.tweets.length ? `<div class="xrc-auto"><div><b>${localizeText("批量自动回复")}</b><label>${localizeText("计划发送")} <input id="xrc-auto-run-count" type="number" min="1" max="2000" value="${plannedCount}" ${state.autoRunning ? "disabled" : ""}> ${localizeText("条")}</label><small>${escapeHtml(localizeText(state.autoStatus || modeDescription))}</small></div>${autoButtons}</div>` : "";
    byId("xrc-list").innerHTML = state.tweets.length ? autoBar + state.tweets.map((t, i) => `
      <article class="xrc-card"><div class="xrc-meta"><b>@${escapeHtml(t.author)}</b><span>❤ ${formatNumber(t.likes)}</span><span>◉ ${formatNumber(t.views)}</span><em>${Math.round(t.ageHours)}h</em>${t.alreadyReplied ? `<strong class="replied">${localizeText("已回复")}</strong>` : ""}</div>
      <p data-xrc-user-content>${escapeHtml(t.text.slice(0, 240))}</p>
      <div class="xrc-actions"><button data-act="open" data-url="${escapeAttr(t.url)}">${localizeText("原帖")}</button><button class="hot" data-act="details" data-index="${i}">${localizeText("生成回复")}</button></div></article>`).join("") : `<div class="xrc-empty">${localizeText("没有符合条件的帖子。尝试降低点赞门槛、清空作者，或先滚动加载更多内容。")}</div>`;
  }

  async function showDetails(index) {
    const tweet = state.tweets[index]; if (!tweet) return;
    if (state.settings.replySource === "ai" && state.settings.replyMode === "directed" && !state.settings.customPrompt.trim()) {
      switchTab("settings");
      return toast("定向回复模式需要先填写提示词并保存", true);
    }
    state.selected = index;
    byId("xrc-detail").classList.add("active");
    byId("xrc-detail").innerHTML = `<button data-act="back">← ${localizeText("返回")}</button><h3>@${escapeHtml(tweet.author)}</h3><p data-xrc-user-content>${escapeHtml(tweet.text)}</p><div class="xrc-loading">${localizeText(state.settings.replySource === "ai" ? "正在生成回复…" : "正在载入指定内容…")}</div>`;
    const result = state.settings.replySource === "specified" ? { replies: parseSpecifiedReplies(state.settings.specifiedReplies) } : await sendAi(tweet);
    if (!result) {
      byId("xrc-detail").innerHTML = `<button data-act="back">← ${localizeText("返回")}</button><h3>${localizeText("生成回复失败")}</h3><p>${localizeText("API 没有成功返回，请检查设置后重试。")}</p>`;
      return;
    }
    tweet.replies = Array.isArray(result.replies) ? result.replies.slice(0, state.settings.suggestionCount).map((reply) => fitReply(reply, state.settings.maxChars)) : [];
    byId("xrc-detail").innerHTML = `<button data-act="back">← ${localizeText("返回")}</button><h3>@${escapeHtml(tweet.author)}</h3><p data-xrc-user-content>${escapeHtml(tweet.text)}</p>
      <h4>${localizeText("回复建议")} <small class="xrc-source-badge">${localizeText(state.settings.replySource === "specified" ? "指定内容" : "AI 生成")}</small></h4>${tweet.replies.map((r, ri) => `<button class="xrc-reply" data-act="fill" data-index="${index}" data-reply="${ri}"><span data-xrc-user-content>${escapeHtml(r)}<small>${[...r].length}/${state.settings.maxChars}</small></span><b>${localizeText("填入")}</b></button>`).join("")}`;
  }

  async function fillReply(index, replyIndex) {
    const tweet = state.tweets[index], reply = tweet?.replies?.[replyIndex]; if (!tweet || !reply) return;
    let sendText = fitReply(normalizeForXEditor(reply), Math.min(state.settings.maxChars, 270));
    let editor = await waitForReplyEditor(4000);
    if (!editor) {
      const targetPath = new URL(tweet.url).pathname;
      const statusId = targetPath.split("/").filter(Boolean).pop();
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const liveArticle = articles.find((article) => article.querySelector(`a[href="${targetPath}"], a[href*="/status/${statusId}"]`)) || (location.pathname.includes(`/status/${statusId}`) ? articles[0] : null);
      if (!liveArticle) {
        if (state.autoRunning) { toast("详情页尚未加载回复区域，自动任务已停止", true); return false; }
        window.open(tweet.url, "_blank"); return toast("已打开原帖，请再次点击扩展中的回复建议");
      }
      liveArticle.scrollIntoView({ behavior: "smooth", block: "center" });
      liveArticle.querySelector('[data-testid="reply"]')?.click();
      const outcome = await waitForReplyEditorOrRestriction(8000);
      if (outcome.restricted) {
        await dismissReplyRestrictionDialog(outcome.dialog);
        toast("该帖子限制了可回复账号，已跳过", true);
        return "restricted";
      }
      editor = outcome.editor;
    }
    const restriction = findReplyRestrictionDialog();
    if (!editor && restriction) {
      await dismissReplyRestrictionDialog(restriction);
      toast("该帖子限制了可回复账号，已跳过", true);
      return "restricted";
    }
    if (!editor) { toast("未找到回复输入框，请手动打开 Reply"); return false; }
    const cleared = await clearPostComposer(editor);
    if (!cleared) {
      toast("回复框原有内容无法清空，已跳过以避免重复", true);
      return false;
    }
    editor = editor?.isConnected ? editor : await waitForReplyEditor(2000);
    const beforeText = readEditorText(editor);
    if (beforeText || composerSendButtonEnabled(editor)) {
      toast("回复框原有内容无法清空，已跳过以避免重复", true);
      return false;
    }
    const fillResult = await replaceEditorText(editor, sendText);
    const activeEditor = fillResult.editor;
    const replyButton = await waitForEnabledSendButton(2500, activeEditor);
    const buttonEnabled = replyButton && replyButton.getAttribute("aria-disabled") !== "true" && !replyButton.disabled;
    // A media attachment also enables X's reply button, and an empty Lexical
    // editor may expose a one-character zero-width placeholder. Only accept the
    // fill when the visible editor text still matches the complete reply.
    if (fillResult.complete && buttonEnabled) {
      toast(`已成功填入并启用回复按钮（${[...sendText].length}/${state.settings.maxChars} 字符）`);
      return { ok: true, text: sendText, editor: activeEditor };
    }
    const diagnostics = readEditorTextDetails(activeEditor);
    const observedLength = [...String(fillResult.actualText || diagnostics.text || "")].length;
    const expectedLength = [...sendText].length;
    const rawLength = [...diagnostics.rawText].length;
    const leafLength = [...diagnostics.leafText].length;
    const diagnostic = rawLength !== observedLength || leafLength !== observedLength ? `；文本层 ${leafLength}，DOM 原始 ${rawLength}` : "";
    const inputError = fillResult.error ? `；输入异常：${String(fillResult.error).slice(0, 80)}` : "";
    const failureReason = `回复框填入失败（检测到 ${observedLength}/${expectedLength} 个可见字符${diagnostic}${inputError}）`;
    await clearReplyEditor();
    toast(`${failureReason}，已清空并准备重试`, true);
    return { ok: false, reason: failureReason };
  }

  async function startAutoReply(fromLoop = false) {
    if (state.autoRunning || !state.tweets.length) return;
    if (state.settings.replySource === "ai" && state.settings.replyMode === "directed" && !state.settings.customPrompt.trim()) { switchTab("settings"); return toast("请先填写定向回复提示词并保存", true); }
    const specified = parseSpecifiedReplies(state.settings.specifiedReplies);
    if (state.settings.replySource === "specified" && !specified.length) { switchTab("settings"); return toast("请先填写至少一条指定回复内容并保存", true); }
    const runCountInput = byId("xrc-auto-run-count");
    const requestedTarget = clamp(runCountInput?.value, 1, 2000, state.settings.autoReplyCount);
    state.settings.autoReplyCount = requestedTarget; await chrome.storage.local.set({ autoReplyCount: requestedTarget });
    const delayDescription = state.settings.delayMode === "random" ? `${state.settings.randomDelayMin}–${state.settings.randomDelayMax} 秒随机间隔` : `${state.settings.autoDelaySeconds} 秒固定间隔`;
    state.autoConfirm = false;
    const directRepeatCount = clamp(state.settings.directTargetRepeatCount, 1, 100, 1);
    const directMultiMode = !fromLoop && state.tweets.length > 0 && state.tweets.every((tweet) => tweet.directTarget) && directRepeatCount > 1;
    const baseCandidates = directMultiMode || state.settings.replyAlreadyReplied
      ? state.tweets
      : state.tweets.filter((tweet) => !tweet.alreadyReplied);
    const candidates = directMultiMode
      ? baseCandidates.flatMap((tweet) => Array.from({ length: directRepeatCount }, (_, repeatIndex) => ({ ...tweet, directRepeatIndex: repeatIndex + 1, directRepeatTotal: directRepeatCount })))
      : baseCandidates;
    if (!candidates.length) return toast("当前没有可发送的候选帖子；请先采集新帖子，或开启“允许重复回复”", true);
    const requiredDistinctReplies = Math.min(directRepeatCount, requestedTarget);
    if (directMultiMode && state.settings.replySource === "specified" && specified.length < requiredDistinctReplies) {
      switchTab("settings");
      return toast(`同帖计划发送多条评论，请至少准备 ${requiredDistinctReplies} 条不同的指定回复内容`, true);
    }
    if (!fromLoop && requestedTarget > candidates.length) {
      const excluded = state.tweets.length - baseCandidates.length;
      state.autoStatus = `计划发送 ${requestedTarget} 条，但当前仅有 ${candidates.length} 条可发送${excluded ? `（另有 ${excluded} 条已回复被排除）` : ""}`;
      renderList();
      switchTab("queue");
      return toast(`候选不足：还需要采集 ${requestedTarget - candidates.length} 条帖子，任务尚未启动`, true);
    }
    const target = fromLoop ? Math.min(requestedTarget, candidates.length) : requestedTarget;
    const items = candidates.map(({ author, text, likes, views, ageHours, url, alreadyReplied }) => ({ author, text, likes, views, ageHours, url, alreadyReplied }));
    const job = { active: true, paused: false, loop: Boolean(fromLoop), directMultiMode, items, requestedTarget, target, excludedAlreadyReplied: state.tweets.length - baseCandidates.length, current: 0, sent: 0, skipped: 0, returnUrl: location.href, allowRepeat: directMultiMode || state.settings.replyAlreadyReplied, replySource: state.settings.replySource, specifiedReplies: specified, specifiedReplyOrder: state.settings.specifiedReplyOrder, replyMode: state.settings.replyMode, customPrompt: state.settings.customPrompt, maxChars: state.settings.maxChars, suggestionCount: 1, delayMode: state.settings.delayMode, delaySeconds: state.settings.autoDelaySeconds, randomDelayMin: state.settings.randomDelayMin, randomDelayMax: state.settings.randomDelayMax, imageUseChance: state.settings.imageUseChance, imageCount: state.settings.imageCount || 1, imageSelectionMode: state.settings.imageSelectionMode || "random", startedAt: Date.now(), ownerTabId: state.tabId, accountId: state.accountId, leaseUntil: Date.now() + 90000, failureStreak: 0, _runId: makeRunId() };
    state.autoStatus = `正在创建 ${job.target} 条自动回复任务 · ${delayDescription}`; renderList();
    await chrome.storage.local.set({ autoJob: job });
    enqueueAiPrefetch(job, 0);
    await delay(100);
    location.href = items[0].url;
  }

  async function resumeAutoJob(job) {
    if (!job?.active || !job.items?.length) return;
    // Local runner gate: prevent duplicate concurrent runners for the same job.
    if (runningJobs["autoJob"]) return;
    runningJobs["autoJob"] = true;
    try {
      if (!await claimJobLease(job, "autoJob")) { runningJobs["autoJob"] = null; return; }
      state.autoRunning = true;
      const myRunId = job._runId;
      updateJobLoopActions(Boolean(job.loop));
      const resumedAtStart = await waitUntilJobResumed(job);
      if (!resumedAtStart) { runningJobs["autoJob"] = null; return; }
      if (resumedAtStart._runId !== myRunId) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, resumedAtStart);
      const target = job.target || job.items.length;
      job.skipped = job.skipped || 0;
      showJobBar(`目标 ${target} 条 · 已发送 ${job.sent} · 已跳过 ${job.skipped}`);
      const tweet = job.items[job.current];
      if (!tweet || job.sent >= target) return finishAutoJob(job, `任务完成，共发送 ${job.sent} 条`);
      if (job.replySource === "ai") enqueueAiPrefetch(job, job.current);
      if (!location.href.includes(new URL(tweet.url).pathname)) { await navigateAutoJob(job, tweet.url); runningJobs["autoJob"] = null; return; }
      const repeatProgress = tweet.directRepeatTotal ? ` · 当前帖子第 ${tweet.directRepeatIndex}/${tweet.directRepeatTotal} 条` : "";
      showJobBar(`目标发送 ${target} 条 · 候选 ${job.current + 1}/${job.items.length}${repeatProgress} · 已发送 ${job.sent} · 已跳过 ${job.skipped}`);
      const pageReady = await waitForTweetPage(tweet, 30000);
      if (!pageReady) {
        if (!runningJobs["autoJob"]) return;
        tweet.loadRetries = (tweet.loadRetries || 0) + 1;
        await chrome.storage.local.set({ autoJob: job });
        if (tweet.loadRetries <= 2) {
          showJobBar(`帖子加载超时，正在重试 ${tweet.loadRetries}/2…`);
          await delay(1000);
          location.reload();
          runningJobs["autoJob"] = null; return;
        }
        return advanceSkippedJob(job, "帖子连续加载失败");
      }
      if (!runningJobs["autoJob"]) return;
      tweet.loadRetries = 0;
      Object.assign(tweet, readCurrentTweet(tweet));
      const resumedAfterLoad = await waitUntilJobResumed(job);
      if (!resumedAfterLoad || resumedAfterLoad._runId !== myRunId) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, resumedAfterLoad);
      if (!runningJobs["autoJob"]) return;
      if (!job.allowRepeat && await hasExistingReply(tweet)) {
        await rememberReplied(tweet.url);
        return advanceSkippedJob(job, "检测到已经回复过");
      }
      if (!job.directMultiMode && job.verifyCurrentBeforeRetry && await hasExistingReply(tweet)) {
        if (!runningJobs["autoJob"]) return;
        job.verifyCurrentBeforeRetry = false;
        await chrome.storage.local.set({ autoJob: job });
        await rememberReplied(tweet.url);
        return advanceSkippedJob(job, "恢复任务时检测到当前帖子已经发送成功");
      }
      if (!runningJobs["autoJob"]) return;
      showJobBar(job.replySource === "specified" ? "正在准备回复内容…" : "正在读取后台 AI 预生成缓存…");
      const result = job.replySource === "specified" ? { replies: job.specifiedReplies } : await getAiReplyForJob(job, tweet, job.current);
      if (!runningJobs["autoJob"]) return;
      const replyPool = Array.isArray(result?.replies) ? result.replies : [];
      const replies = (job.replySource === "specified" ? replyPool : replyPool.slice(0, job.suggestionCount || 1))
        .map((reply) => fitReply(reply, job.maxChars || state.settings.maxChars));
      if (!replies.length) return advanceSkippedJob(job, "回复内容生成失败");
      const resumedAfterGeneration = await waitUntilJobResumed(job);
      if (!resumedAfterGeneration || resumedAfterGeneration._runId !== myRunId) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, resumedAfterGeneration);
      if (!runningJobs["autoJob"]) return;
      state.tweets = [{ ...tweet, replies }];
      let replyIndex = job.sent % replies.length;
      if (job.replySource === "specified" && job.specifiedReplyOrder === "random") {
        const previous = Number.isInteger(job.lastSpecifiedReplyIndex) ? job.lastSpecifiedReplyIndex : -1;
        if (replies.length > 1) {
          const offset = Math.floor(Math.random() * (replies.length - 1)) + 1;
          replyIndex = (previous + offset + replies.length) % replies.length;
        } else {
          replyIndex = 0;
        }
        job.lastSpecifiedReplyIndex = replyIndex;
        if (!runningJobs["autoJob"]) return;
        await chrome.storage.local.set({ autoJob: job });
      }
      showJobBar(`正在将第 ${job.sent + 1}/${target} 条内容写入回复框…`);
      const filled = await fillReply(0, replyIndex);
      if (filled === "restricted") return advanceSkippedJob(job, "该帖子仅允许部分账号回复");
      if (!filled?.ok) return retryCurrentStep(job, tweet, "fillRetries", filled?.reason || "回复框填入失败", 2);
      if (!runningJobs["autoJob"]) return;
      const resumedBeforeSend = await waitUntilJobResumed(job);
      if (!resumedBeforeSend || resumedBeforeSend._runId !== myRunId) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, resumedBeforeSend);
      if (!runningJobs["autoJob"]) return;
      await maybeAttachRandomImage(job, filled.editor);
      if (!runningJobs["autoJob"]) return;
      let activeEditor = filled.editor?.isConnected ? filled.editor : findReplyEditor();
      const expectedText = filled.text;
      if (!editorTextMatches(readEditorText(activeEditor), expectedText)) {
        showJobBar("图片已载入，正在恢复回复文字…");
        const restored = await replaceEditorText(activeEditor, expectedText);
        activeEditor = restored.editor;
        if (!restored.complete) return retryCurrentStep(job, tweet, "fillRetries", "图片载入后回复文字丢失", 2);
      }
      // Strict composer-bound send-button discovery: no document fallback.
      const sendButton = await waitForStrictSendButton(15000, activeEditor);
      if (!sendButton) return retryCurrentStep(job, tweet, "buttonRetries", "发送按钮不在当前回复框中", 2);
      if (!runningJobs["autoJob"]) return;
      const resumedAfterMedia = await waitUntilJobResumed(job);
      if (!resumedAfterMedia || resumedAfterMedia._runId !== myRunId) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, resumedAfterMedia);
      if (!runningJobs["autoJob"]) return;
      if (!await waitForSendWindow("reply", job, "autoJob")) { runningJobs["autoJob"] = null; return; }
      // Final pre-click fence: re-read job, verify not paused, same runId, editor still connected,
      // then acquire ONE fresh button from the strict composer scope and validate it.
      const freshJob = (await chrome.storage.local.get("autoJob")).autoJob;
      if (!freshJob?.active || freshJob.paused || freshJob._runId !== myRunId || !freshJob.ownerTabId || freshJob.ownerTabId !== state.tabId) { runningJobs["autoJob"] = null; return; }
      if (!activeEditor?.isConnected) { runningJobs["autoJob"] = null; return; }
      if (!editorTextMatches(readEditorText(activeEditor), expectedText)) { runningJobs["autoJob"] = null; return retryCurrentStep(job, tweet, "fillRetries", "回复文字在发送前被清空", 1); }
      const button = findSendButtonStrict(activeEditor);
      if (!button || !scopeContainsElement(activeEditor, button)) { runningJobs["autoJob"] = null; return retryCurrentStep(job, tweet, "buttonRetries", "发送按钮不在当前回复框中", 1); }
      button.click();
      showJobBar(`正在确认第 ${job.sent + 1}/${target} 条是否发送成功…`);
      const submission = await waitForReplySubmission(30000, expectedText, false);
      if (!runningJobs["autoJob"]) return;
      if (submission === "duplicate") return advanceSkippedJob(job, "X 提示这条回复已经发送过");
      if (submission !== "sent") {
        job.verifyCurrentBeforeRetry = !job.directMultiMode;
        const reason = submission === "failed" ? "X 返回发送失败" : "发送结果暂时无法确认";
        return retryCurrentStep(job, tweet, "submitRetries", reason, 2);
      }
      // Commit the sent item using fresh storage read to avoid overwriting pause.
      if (!runningJobs["autoJob"]) return;
      const committed = await commitJobMutation("autoJob", myRunId, (latest) => {
        tweet.fillRetries = 0; tweet.buttonRetries = 0; tweet.submitRetries = 0;
        latest.sent = (latest.sent || 0) + 1;
        latest.current = (latest.current || 0) + 1;
        latest.failureStreak = 0;
        return latest;
      });
      if (!committed) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, committed);
      await recordSuccessfulSend("reply");
      await rememberReplied(tweet.url);
      if (state.settings.autoLikeReply) likeMostRecentOwnPost().catch(() => {});
      const waitSeconds = chooseJobDelay(job);
      enqueueAiPrefetch(job, job.current);
      showJobBar(`已发送 ${job.sent}/${target}，等待 ${waitSeconds} 秒；后台缓存后续 ${AI_PREFETCH_BUFFER_SIZE} 条…`);
      await delay(500);
      if (!runningJobs["autoJob"]) return;
      if (job.sent >= target || job.current >= job.items.length) return finishAutoJob(job, `任务完成，共发送 ${job.sent} 条`);
      const waited = await waitJobDelay(job, waitSeconds);
      if (!waited) return;
      if (!runningJobs["autoJob"]) return;
      const latest = await chrome.storage.local.get("autoJob");
      if (!latest.autoJob?.active) { runningJobs["autoJob"] = null; return; }
      Object.assign(job, latest.autoJob);
      enqueueAiPrefetch(job, job.current);
      await navigateAutoJob(job, job.items[job.current].url);
    } catch (error) {
      console.error("[XRC] 自动回复任务异常", error);
      const detail = String(error?.message || error || "未知错误").slice(0, 160);
      try {
        await pauseAutoJobWithReason(job, `自动任务异常：${detail}；任务已暂停，请刷新页面后继续`);
      } catch {
        state.autoRunning = false;
        showJobBar(`自动任务异常：${detail}`);
        toast(`自动任务异常：${detail}`, true);
      }
    } finally {
      runningJobs["autoJob"] = null;
    }
  }
  // Strict button wait used only by the automatic send path.
  async function waitForStrictSendButton(timeoutMs, editor) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!editor?.isConnected) return null;
      const button = findSendButtonStrict(editor);
      if (button) return button;
      await delay(250);
    }
    return null;
  }

  async function cancelAutoJob() {
    runningJobs["autoJob"] = null;
    for (const wake of [...delayWaiters]) wake();
    const saved = await chrome.storage.local.get("autoJob");
    const job = saved.autoJob;
    clearAiPrefetch(job?._runId);
    await chrome.storage.local.remove("autoJob");
    state.autoRunning = false;
    state.autoStop = true;
    for (const wake of [...delayWaiters]) wake();
    showJobBar("");
    toast(job?.loop
      ? `本轮已结束：发送 ${job?.sent || 0} 条，循环将在设定间隔后继续`
      : `任务已停止：发送 ${job?.sent || 0} 条，跳过 ${job?.skipped || 0} 条`);
    const cleared = await clearReplyEditor();
    if (!cleared) toast("任务已结束，但 X 草稿未能自动清空；已停留当前页，请手动处理", true);
    if (job?.loop) {
      const loop = (await chrome.storage.local.get("replyLoopJob")).replyLoopJob;
      if (!loop?.active) return;
      loop.sent = (loop.sent || 0) + (job.sent || 0);
      loop.skipped = (loop.skipped || 0) + (job.skipped || 0);
      loop.emptyRounds = job.sent > 0 ? 0 : (loop.emptyRounds || 0) + 1;
      if (loop.sent >= loop.totalLimit) return finishReplyLoop(loop, `已达到总发送上限 ${loop.totalLimit}`);
      if (loop.stopAfterRound) return finishReplyLoop(loop, "已处理到帖子列表底部，循环自动结束");
      if (loop.emptyRounds >= loop.emptyRoundLimit) return finishReplyLoop(loop, `连续 ${loop.emptyRounds} 轮没有成功发送，循环已自动停止`);
      updateJobLoopActions(false);
      return scheduleNextReplyLoopRound(loop, `本轮已手动结束，发送 ${job.sent || 0} 条`);
    }
    updateJobLoopActions(false);
    if (cleared && job?.returnUrl && location.href !== job.returnUrl) location.href = job.returnUrl;
  }

  async function navigateAutoJob(job, url) {
    const cleared = await clearReplyEditor();
    if (!cleared) {
      return pauseAutoJobWithReason(job, "X 草稿无法安全清空，任务已暂停；请手动清空后继续");
    }
    location.href = url;
    return true;
  }

  async function setAutoJobPaused(paused) {
    if (paused) {
      // Kill the active runner immediately: clear its gate, mark stopped,
      // and wake delay waiters so any in-flight await exits.
      runningJobs["autoJob"] = null;
      state.autoRunning = false;
      for (const wake of [...delayWaiters]) wake();
    }
    const saved = await chrome.storage.local.get("autoJob");
    const job = saved.autoJob;
    if (!job?.active) return toast("当前没有正在运行的自动回复任务", true);
    const previousRunId = job._runId;
    job.paused = Boolean(paused);
    if (job.paused) {
      delete job.waitState; delete job.nextRunAt;
      job._runId = makeRunId();
      clearAiPrefetch(previousRunId);
    }
    const shouldRestart = !job.paused && !state.autoRunning;
    if (!job.paused) {
      job.needsRestart = false;
      job.failureStreak = 0;
      const currentTweet = job.items?.[job.current];
      if (currentTweet) {
        currentTweet.fillRetries = 0;
        currentTweet.buttonRetries = 0;
        currentTweet.submitRetries = 0;
      }
    }
    await chrome.storage.local.set({ autoJob: job });
    for (const wake of [...delayWaiters]) wake();
    updateJobPauseButton(job.paused);
    showJobBar(job.paused ? `任务已暂停 · 已发送 ${job.sent || 0} · 已跳过 ${job.skipped || 0}` : `任务已继续 · 已发送 ${job.sent || 0} · 已跳过 ${job.skipped || 0}`);
    if (shouldRestart && !state.autoRunning) resumeAutoJob(job);
  }

  async function retryCurrentStep(job, tweet, counterKey, reason, maxRetries) {
    const cleared = await clearReplyEditor();
    if (!cleared) {
      return pauseAutoJobWithReason(job, `${reason}；X 草稿无法安全清空，任务已暂停，请手动清空后继续`);
    }
    tweet[counterKey] = (tweet[counterKey] || 0) + 1;
    await chrome.storage.local.set({ autoJob: job });
    if (tweet[counterKey] <= maxRetries) {
      if (!runningJobs["autoJob"]) return;
      showJobBar(`${reason}，正在当前页面自动恢复 ${tweet[counterKey]}/${maxRetries}…`);
      await resilientDelay(1200);
      if (!runningJobs["autoJob"]) return;
      runningJobs["autoJob"] = null;  // release gate so resumeAutoJob can re-enter
      state.autoRunning = false;
      const fresh = (await chrome.storage.local.get("autoJob")).autoJob;
      if (!fresh?.active || fresh.paused || !fresh.ownerTabId || fresh.ownerTabId !== state.tabId) return;
      return resumeAutoJob(fresh);
    }
    tweet[counterKey] = 0;
    job.verifyCurrentBeforeRetry = false;
    job.failureStreak = (job.failureStreak || 0) + 1;
    await chrome.storage.local.set({ autoJob: job });
    if (job.failureStreak >= Number(state.settings.consecutiveFailureLimit || 5)) {
      return pauseAutoJobWithReason(job, `${reason}；连续失败达到熔断上限，任务已暂停供检查`);
    }
    return advanceSkippedJob(job, `${reason}，自动重试仍未成功`);
  }

  async function pauseAutoJobWithReason(job, reason) {
    runningJobs["autoJob"] = null;
    for (const wake of [...delayWaiters]) wake();
    const previousRunId = job._runId;
    job.paused = true;
    delete job.waitState;
    delete job.nextRunAt;
    job._runId = makeRunId();
    clearAiPrefetch(previousRunId);
    job.lastSkipReason = reason;
    await chrome.storage.local.set({ autoJob: job });
    state.autoRunning = false;
    updateJobPauseButton(true);
    showJobBar(reason);
    toast(reason, true);
    return false;
  }

  async function waitUntilJobResumed(job) {
    while (true) {
      const saved = await chrome.storage.local.get("autoJob");
      const latest = saved.autoJob;
      if (!latest?.active) { state.autoRunning = false; return null; }
      if (!latest.paused) { updateJobPauseButton(false); return latest; }
      updateJobPauseButton(true);
      showJobBar(`任务已暂停 · 已发送 ${latest.sent || 0} · 已跳过 ${latest.skipped || 0}`);
      await delay(500);
    }
  }

  async function waitJobDelay(job, seconds) {
    if (!job.nextRunAt) {
      job.nextRunAt = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
      await chrome.storage.local.set({ autoJob: job });
    }
    while (Date.now() < job.nextRunAt) {
      const latest = await waitUntilJobResumed(job);
      if (!latest) return false;
      Object.assign(job, latest);
      await resilientDelay(Math.min(1000, Math.max(0, job.nextRunAt - Date.now())));
    }
    delete job.nextRunAt;
    await chrome.storage.local.set({ autoJob: job });
    return true;
  }

  function updateJobPauseButton(paused) {
    const button = byId("xrc-pause-job"); if (!button) return;
    button.textContent = localizeText(paused ? "继续" : "暂停");
    button.dataset.act = paused ? "resume-job" : "pause-job";
  }
  function updateJobLoopActions(loopMode) {
    const cancel = byId("xrc-cancel-job");
    const stopLoop = byId("xrc-stop-loop-job");
    if (cancel) cancel.textContent = localizeText(loopMode ? "结束本轮" : "结束任务");
    if (stopLoop) stopLoop.textContent = localizeText("终止循环");
    stopLoop?.classList.toggle("xrc-hidden", !loopMode);
  }

  async function finishAutoJob(job, message, isError = false) {
    const cleared = await clearReplyEditor();
    if (!cleared) return pauseAutoJobWithReason(job, `${message}；X 草稿无法安全清空，任务已暂停，请手动清空后继续`);
    clearAiPrefetch(job._runId);
    if (job.loop) {
      await chrome.storage.local.remove("autoJob");
      state.autoRunning = false; showJobBar(""); updateJobLoopActions(false);
      const loop = (await chrome.storage.local.get("replyLoopJob")).replyLoopJob;
      if (!loop?.active) return;
      loop.sent = (loop.sent || 0) + (job.sent || 0);
      loop.skipped = (loop.skipped || 0) + (job.skipped || 0);
      loop.emptyRounds = job.sent > 0 ? 0 : (loop.emptyRounds || 0) + 1;
      if (loop.sent >= loop.totalLimit) return finishReplyLoop(loop, `已达到总发送上限 ${loop.totalLimit}`);
      if (loop.stopAfterRound) return finishReplyLoop(loop, "已处理完页面底部前的候选帖子，循环自动结束");
      if (loop.emptyRounds >= loop.emptyRoundLimit) return finishReplyLoop(loop, `连续 ${loop.emptyRounds} 轮没有成功发送，已自动停止`);
      return scheduleNextReplyLoopRound(loop, `第 ${loop.rounds} 轮完成，发送 ${job.sent || 0} 条`);
    }
    await chrome.storage.local.remove("autoJob");
    await chrome.storage.local.set({ autoLastStatus: message });
    state.autoRunning = false; showJobBar(""); updateJobLoopActions(false); toast(message, isError);
    if (job.returnUrl && location.href !== job.returnUrl) location.href = job.returnUrl;
  }

  async function advanceSkippedJob(job, reason) {
    const resumed = await waitUntilJobResumed(job);
    if (!resumed) return;
    Object.assign(job, resumed);
    const cleared = await clearReplyEditor();
    if (!cleared) {
      return pauseAutoJobWithReason(job, `${reason}；X 草稿无法安全清空，任务已暂停，请手动清空后继续`);
    }
    job.skipped = (job.skipped || 0) + 1;
    job.current += 1;
    job.lastSkipReason = reason;
    await chrome.storage.local.set({ autoJob: job });
    enqueueAiPrefetch(job, job.current);
    const target = job.target || job.items.length;
    if (job.sent >= target) return finishAutoJob(job, `任务完成：发送 ${job.sent} 条，跳过 ${job.skipped} 条`);
    if (job.current >= job.items.length) return finishAutoJob(job, `候选帖子已处理完：发送 ${job.sent} 条，跳过 ${job.skipped} 条`);
    showJobBar(`${reason}，继续下一条 · 已发送 ${job.sent} · 已跳过 ${job.skipped}`);
    await waitJobDelay(job, 1.2);
    const latest = await chrome.storage.local.get("autoJob");
    if (!latest.autoJob?.active) return;
    location.href = job.items[job.current].url;
  }

  function enqueueAiPrefetch(job, startIndex = job?.current || 0) {
    if (!job?.active || job.paused || job.replySource !== "ai" || !job._runId) return false;
    const start = Math.max(0, Number(startIndex) || 0);
    const remainingTarget = Math.max(0, Number(job.target || job.items?.length || 0) - Number(job.sent || 0));
    const end = Math.min(job.items?.length || 0, start + AI_PREFETCH_BUFFER_SIZE, start + remainingTarget);
    const entries = [];
    for (let index = start; index < end; index += 1) {
      const tweet = job.items[index];
      if (!tweet?.url) continue;
      entries.push({
        index,
        tweet: { author: tweet.author, text: tweet.text, likes: tweet.likes, views: tweet.views, ageHours: tweet.ageHours, url: tweet.url }
      });
    }
    if (!entries.length) return false;
    try {
      chrome.runtime.sendMessage({
        type: "AI_PREFETCH_JOB",
        payload: {
          runId: job._runId,
          entries,
          replyMode: job.replyMode || state.settings.replyMode,
          customPrompt: job.customPrompt ?? state.settings.customPrompt,
          maxChars: job.maxChars || state.settings.maxChars,
          suggestionCount: 1
        }
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async function readAiPrefetchRecord(job, index) {
    const stored = await chrome.storage.local.get(AI_PREFETCH_CACHE_KEY);
    const key = `${job?._runId || ""}:${Number(index)}`;
    const record = stored[AI_PREFETCH_CACHE_KEY]?.entries?.[key] || null;
    if (!record || record.runId !== job?._runId || record.url !== job?.items?.[index]?.url) return null;
    return record;
  }

  async function waitForAiPrefetch(job, index, timeoutMs = 95000) {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let lastRenderedSecond = -1;
    while (Date.now() < deadline) {
      if (!runningJobs["autoJob"]) return { status: "stopped" };
      const record = await readAiPrefetchRecord(job, index);
      if (record?.status === "ready" && Array.isArray(record.replies) && record.replies.length) {
        return { status: "ready", replies: record.replies };
      }
      if (record?.status === "error") return { status: "error", error: record.error };
      const elapsedMs = Date.now() - startedAt;
      // If the background did not even create a cache record, fall back to the
      // direct request instead of waiting through the full provider timeout.
      if (!record && elapsedMs >= 2000) return { status: "missing" };
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      if (elapsedSeconds !== lastRenderedSecond) {
        lastRenderedSecond = elapsedSeconds;
        showJobBar(`后台 AI 正在预生成第 ${index + 1}/${job.target || job.items.length} 条 · 已等待 ${elapsedSeconds} 秒…`);
      }
      await delay(400);
    }
    return { status: "timeout" };
  }

  async function getAiReplyForJob(job, tweet, index) {
    if (Array.isArray(tweet?.preparedReplies) && tweet.preparedReplies.length) return { replies: tweet.preparedReplies };
    enqueueAiPrefetch(job, index);
    const prefetched = await waitForAiPrefetch(job, index);
    if (prefetched.status === "ready") return { replies: prefetched.replies };
    if (prefetched.status === "stopped") return null;
    if (prefetched.status === "missing") {
      showJobBar("后台预生成队列未就绪，正在直接请求 AI…");
      return sendAi(tweet, 1, job);
    }
    const error = prefetched.error || { code: "timeout", detail: "AI prefetch timeout" };
    toast(`AI 预生成失败：${localizeError(error)}`, true);
    return null;
  }

  function clearAiPrefetch(runId) {
    if (!runId) return;
    try { chrome.runtime.sendMessage({ type: "AI_PREFETCH_CLEAR", runId }).catch(() => {}); } catch {}
  }

  async function sendAi(tweet, suggestionCountOverride, configOverride) {
    try {
      const suggestionCount = Number.isFinite(Number(suggestionCountOverride)) ? Number(suggestionCountOverride) : state.settings.suggestionCount;
      const response = await chrome.runtime.sendMessage({ type: "AI_REQUEST", payload: { replyMode: configOverride?.replyMode || state.settings.replyMode, customPrompt: configOverride?.customPrompt ?? state.settings.customPrompt, maxChars: configOverride?.maxChars || state.settings.maxChars, suggestionCount, tweet: { author: tweet.author, text: tweet.text, likes: tweet.likes, views: tweet.views, ageHours: Math.round(tweet.ageHours), url: tweet.url } } });
      if (!response?.ok) { const failure = response?.error || { code: "providerError", detail: "Unknown error" }; throw Object.assign(new Error(failure.detail || failure.message || "Unknown error"), failure); } return response.data;
    } catch (error) { toast(localizeError(error), true); switchTab("settings"); return null; }
  }

  function closeDetails() { byId("xrc-detail").classList.remove("active"); }
  function findSendButton(editor = findReplyEditor()) {
    const selector = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
    const activeEditor = editor?.isConnected ? editor : findReplyEditor();
    const composer = findComposerContainer(activeEditor);
    const dialog = activeEditor?.closest('[role="dialog"]');
    const scopes = [...new Set([composer, dialog].filter(Boolean))];
    const rankButtons = (buttons) => buttons
      .filter(isVisibleElement)
      .sort((a, b) => {
        const aEnabled = a.getAttribute("aria-disabled") !== "true" && !a.disabled;
        const bEnabled = b.getAttribute("aria-disabled") !== "true" && !b.disabled;
        return Number(bEnabled) - Number(aEnabled) || elementPriority(b) - elementPriority(a);
      });
    for (const scope of scopes) {
      const scoped = rankButtons([...scope.querySelectorAll(selector)]);
      if (scoped.length) return scoped[0];
    }
    // /compose/post is not always rendered inside role=dialog. Include both X
    // button variants globally as a final fallback, preferring an enabled one.
    return rankButtons([...document.querySelectorAll(selector)])[0] || null;
  }
  // Automatic-send path: only picks a send button inside the verified composer.
  function findSendButtonStrict(editor) {
    if (!editor?.isConnected) return null;
    const selector = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
    const composer = findComposerContainer(editor);
    const dialog = editor.closest('[role="dialog"]');
    const scopes = [...new Set([composer, dialog].filter(Boolean))];
    for (const scope of scopes) {
      const buttons = [...scope.querySelectorAll(selector)].filter(isVisibleElement);
      const enabled = buttons.find((b) => b.getAttribute("aria-disabled") !== "true" && !b.disabled);
      if (enabled) return enabled;
    }
    return null;
  }
  function findComposerFileInput(editor) {
    if (!editor?.isConnected) return null;
    const composer = findComposerContainer(editor);
    const dialog = editor.closest('[role="dialog"]');
    const scopes = [...new Set([composer, dialog].filter(Boolean))];
    const fileSel = 'input[data-testid="fileInput"][type="file"], input[type="file"][accept*="image"]';
    for (const scope of scopes) {
      const input = scope.querySelector(fileSel);
      if (input && isVisibleElement(input)) return input;
    }
    // Broader fallback: X may place the file input in a toolbar outside the
    // send-button container but still inside the dialog area.  Search the
    // entire document filtered by visibility and pick the first that matches.
    return [...document.querySelectorAll(fileSel)].find(isVisibleElement) || null;
  }
  function scopeContainsElement(editor, child) {
    if (!editor?.isConnected || !child?.isConnected) return false;
    const composer = findComposerContainer(editor);
    const dialog = editor.closest('[role="dialog"]');
    return Boolean((composer && composer.contains(child)) || (dialog && dialog.contains(child)));
  }
  function findComposerMediaPreview(editor) {
    if (!editor?.isConnected) return null;
    const composer = findComposerContainer(editor);
    const dialog = editor.closest('[role="dialog"]');
    const scopes = [...new Set([composer, dialog].filter(Boolean))];
    for (const scope of scopes) {
      const preview = scope.querySelector('[data-testid="attachments"], [data-testid="removeMedia"], [data-testid="mediaPreview"], img[src^="blob:"]');
      if (preview) return preview;
    }
    return null;
  }
  async function hasExistingReply(tweet) {
    const key = normalizeTweetUrl(tweet.url);
    if (state.repliedUrls.has(key)) return true;
    const stored = await chrome.storage.local.get("repliedTweetUrls");
    const persisted = new Set((Array.isArray(stored.repliedTweetUrls) ? stored.repliedTweetUrls : []).map(normalizeTweetUrl).filter(Boolean));
    if (persisted.has(key)) {
      state.repliedUrls.add(key);
      return true;
    }
    const profileHref = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") || "";
    const myHandle = profileHref.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!myHandle) return false;
    const targetPath = new URL(tweet.url).pathname;
    return [...document.querySelectorAll('article[data-testid="tweet"]')].some((article) => {
      const href = article.querySelector('time')?.closest('a[href*="/status/"]')?.getAttribute("href") || "";
      const parts = href.split("/").filter(Boolean);
      return href !== targetPath && parts[0]?.toLowerCase() === myHandle;
    });
  }
  async function rememberReplied(url) { state.repliedUrls.add(normalizeTweetUrl(url)); const values = [...state.repliedUrls].filter(Boolean).slice(-5000); state.repliedUrls = new Set(values); await chrome.storage.local.set({ repliedTweetUrls: values }); }
  function normalizeTweetUrl(url) {
    const raw = String(url || "").trim();
    if (/^status:\d+$/i.test(raw)) return raw.toLowerCase();
    try {
      const parsed = new URL(raw, location.origin);
      const statusId = parsed.pathname.match(/\/status\/(\d+)/i)?.[1];
      return statusId ? `status:${statusId}` : `${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
    } catch {
      const statusId = raw.match(/\/status\/(\d+)/i)?.[1];
      return statusId ? `status:${statusId}` : raw.toLowerCase();
    }
  }
  function normalizeForXEditor(value) { return String(value || "").replace(/\s*\r?\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim(); }
  function normalizeComparable(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function contentLooksComplete(actual, expected) {
    const clean = (value) => normalizeComparable(value).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
    const a = clean(actual), e = clean(expected);
    if (a === e) return true;
    if (!a || !e || a.length < e.length * 0.7 || a.length > e.length * 1.3) return false;
    const tokens = [...new Set(e.toLowerCase().split(/\s+/).filter((token) => token.length >= 2))];
    if (!tokens.length) return a.length >= e.length * 0.9;
    const actualLower = a.toLowerCase();
    const matched = tokens.filter((token) => actualLower.includes(token)).length;
    return matched / tokens.length >= 0.75;
  }
  function updateSafeguardsUi() { const enabled = byId("xrc-safeguards-enabled")?.checked; byId("xrc-safeguards-body")?.classList.toggle("xrc-hidden", !enabled); }
  function updateDelayModeUi() { const random = byId("xrc-delaymode")?.value === "random"; byId("xrc-fixed-delay")?.classList.toggle("xrc-hidden", random); byId("xrc-random-delay")?.classList.toggle("xrc-hidden", !random); }
  function updateReplySourceUi() { const specified = byId("xrc-source")?.value === "specified"; byId("xrc-specified-settings")?.classList.toggle("xrc-hidden", !specified); byId("xrc-ai-settings")?.classList.toggle("xrc-hidden", specified); }
  function parseSpecifiedReplies(value, applyLimit = true) { const items = Array.isArray(value) ? value : String(value || "").split(/\n\s*\n+/); const cleaned = items.map((text) => String(text || "").trim()).filter(Boolean); return applyLimit ? cleaned.map((text) => fitReply(text, state.settings.maxChars)) : cleaned; }
  function renderSpecifiedRows(values) {
    const list = byId("xrc-specified-list");
    const rows = values?.length ? [...values] : [""];
    list.innerHTML = rows.reverse().map((value, index) => specifiedRowHtml(value, rows.length - index)).join("");
    updateSpecifiedRowLabels();
  }
  function specifiedRowHtml(value, number) { return `<div class="xrc-specified-row"><div><b>${localizeText("回复")} ${number}</b><button data-act="remove-specified" title="${localizeText("删除")}">${localizeText("删除")}</button></div><textarea data-specified-reply rows="3" placeholder="${localizeText("填写第")} ${number} ${localizeText("条固定回复")}">${escapeHtml(value)}</textarea></div>`; }
  function addSpecifiedRow() {
    const details = byId("xrc-specified-details");
    const list = byId("xrc-specified-list");
    const number = list.querySelectorAll(".xrc-specified-row").length + 1;
    details.open = true;
    list.insertAdjacentHTML("afterbegin", specifiedRowHtml("", number));
    updateSpecifiedRowLabels();
    list.querySelector("textarea")?.focus();
  }
  function toggleReplyBulkImport(show, clear = false) {
    const details = byId("xrc-specified-details");
    const panel = byId("xrc-reply-bulk-import");
    const textarea = byId("xrc-reply-bulk-text");
    if (!panel || !textarea) return;
    if (details) details.open = true;
    panel.classList.toggle("xrc-hidden", !show);
    if (clear) textarea.value = "";
    if (show) textarea.focus();
  }
  function importReplyContents() {
    const textarea = byId("xrc-reply-bulk-text");
    const imported = parseBulkNumberedContents(textarea?.value);
    if (!imported.length) return toast("没有识别到可导入的回复，请使用 1.、2.、3. 编号格式", true);
    const existing = getSpecifiedRowValues();
    const existingKeys = new Set(existing.map((value) => normalizeComparable(value).normalize("NFKC").toLowerCase()));
    const additions = uniquePostContents(imported)
      .filter((value) => !existingKeys.has(normalizeComparable(value).normalize("NFKC").toLowerCase()));
    if (!additions.length) return toast("导入内容与现有回复重复，没有新增", true);
    const merged = [...existing, ...additions];
    renderSpecifiedRows(merged);
    if (textarea) textarea.value = "";
    toggleReplyBulkImport(false);
    toast(`已批量导入 ${additions.length} 条回复，当前共 ${merged.length} 条；请点击保存设置`);
  }
  function removeSpecifiedRow(button) { const rows = byId("xrc-specified-list").querySelectorAll(".xrc-specified-row"); if (rows.length <= 1) { rows[0].querySelector("textarea").value = ""; return toast("至少保留一个输入框"); } button.closest(".xrc-specified-row")?.remove(); updateSpecifiedRowLabels(); }
  function updateSpecifiedRowLabels() {
    const rows = [...byId("xrc-specified-list").querySelectorAll(".xrc-specified-row")];
    rows.forEach((row, index) => {
      const number = rows.length - index;
      row.querySelector("b").textContent = `${localizeText("回复")} ${number}`;
      row.querySelector("textarea").placeholder = `${localizeText("填写第")} ${number} ${localizeText("条固定回复")}`;
      row.querySelector("button").textContent = localizeText("删除");
      row.querySelector("button").title = localizeText("删除");
    });
    const count = rows.filter((row) => row.querySelector("textarea")?.value.trim()).length;
    byId("xrc-specified-count").textContent = state.locale === "zh-CN" ? `${count} 条` : `${count} items`;
  }
  function getSpecifiedRowValues() {
    return [...byId("xrc-specified-list").querySelectorAll("textarea[data-specified-reply]")]
      .map((textarea) => textarea.value.trim()).filter(Boolean).reverse();
  }
  function postContentRowHtml(value, number) {
    return `<div class="xrc-specified-row"><div><b>${localizeText("帖子")} ${number}</b><button data-act="remove-post-content">${localizeText("删除")}</button></div><textarea data-post-content rows="4" placeholder="${localizeText("填写第")} ${number} ${localizeText("条固定帖子")}">${escapeHtml(value)}</textarea></div>`;
  }
  function renderPostContentRows(values) {
    const rows = Array.isArray(values) && values.length ? [...values] : [""];
    byId("xrc-post-specified-list").innerHTML = rows.reverse().map((value, index) => postContentRowHtml(value, rows.length - index)).join("");
    updatePostContentLabels();
  }
  function addPostContentRow() {
    const details = byId("xrc-post-specified-details");
    const list = byId("xrc-post-specified-list");
    const number = list.querySelectorAll(".xrc-specified-row").length + 1;
    details.open = true;
    list.insertAdjacentHTML("afterbegin", postContentRowHtml("", number));
    updatePostContentLabels();
    list.querySelector("textarea")?.focus();
  }
  function togglePostBulkImport(show, clear = false) {
    const details = byId("xrc-post-specified-details");
    const panel = byId("xrc-post-bulk-import");
    const textarea = byId("xrc-post-bulk-text");
    if (!panel || !textarea) return;
    if (details) details.open = true;
    panel.classList.toggle("xrc-hidden", !show);
    if (clear) textarea.value = "";
    if (show) textarea.focus();
  }
  function parseBulkNumberedContents(value) {
    const text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return [];
    const marker = /^[ \t]*\d+[ \t]*[.、．)][ \t]*/gm;
    const markers = [];
    let match;
    while ((match = marker.exec(text))) markers.push({ start: match.index, contentStart: marker.lastIndex });
    if (!markers.length) {
      return text.split(/\n[ \t]*\n+/).map((item) => item.trim()).filter(Boolean);
    }
    return markers.map((item, index) => {
      const end = index + 1 < markers.length ? markers[index + 1].start : text.length;
      return text.slice(item.contentStart, end).trim();
    }).filter(Boolean);
  }
  function parseBulkPostContents(value) { return parseBulkNumberedContents(value); }
  function importPostContents() {
    const textarea = byId("xrc-post-bulk-text");
    const imported = parseBulkPostContents(textarea?.value);
    if (!imported.length) return toast("没有识别到可导入的帖子，请使用 1.、2.、3. 编号格式", true);
    const existing = getPostContentValues();
    const existingKeys = new Set(existing.map((value) => normalizeComparable(value).normalize("NFKC").toLowerCase()));
    const additions = uniquePostContents(imported).filter((value) => !existingKeys.has(normalizeComparable(value).normalize("NFKC").toLowerCase()));
    if (!additions.length) return toast("导入内容与现有帖子重复，没有新增", true);
    const merged = [...existing, ...additions];
    renderPostContentRows(merged);
    if (textarea) textarea.value = "";
    togglePostBulkImport(false);
    toast(`已批量导入 ${additions.length} 条帖子，当前共 ${merged.length} 条`);
  }
  function removePostContentRow(button) {
    const rows = byId("xrc-post-specified-list").querySelectorAll(".xrc-specified-row");
    if (rows.length <= 1) { rows[0].querySelector("textarea").value = ""; return toast("至少保留一个发帖输入框"); }
    button.closest(".xrc-specified-row")?.remove();
    updatePostContentLabels();
  }
  function updatePostContentLabels() {
    const rows = [...byId("xrc-post-specified-list").querySelectorAll(".xrc-specified-row")];
    rows.forEach((row, index) => {
      const number = rows.length - index;
      row.querySelector("b").textContent = `${localizeText("帖子")} ${number}`;
      row.querySelector("textarea").placeholder = `${localizeText("填写第")} ${number} ${localizeText("条固定帖子")}`;
      row.querySelector("button").textContent = localizeText("删除");
    });
    const count = rows.filter((row) => row.querySelector("textarea")?.value.trim()).length;
    byId("xrc-post-specified-count").textContent = state.locale === "zh-CN" ? `${count} 条` : `${count} items`;
  }
  function getPostContentValues() {
    return [...byId("xrc-post-specified-list").querySelectorAll("textarea[data-post-content]")]
      .map((textarea) => textarea.value.trim()).filter(Boolean).reverse();
  }
  function updatePostSourceUi() {
    const specified = byId("xrc-post-source")?.value === "specified";
    byId("xrc-post-specified-settings")?.classList.toggle("xrc-hidden", !specified);
    byId("xrc-post-ai-settings")?.classList.toggle("xrc-hidden", specified);
  }
  function updatePostDelayModeUi() {
    const random = byId("xrc-post-delaymode")?.value === "random";
    byId("xrc-post-fixed-delay")?.classList.toggle("xrc-hidden", random);
    byId("xrc-post-random-delay")?.classList.toggle("xrc-hidden", !random);
  }
  function updatePostDestinationUi() {
    byId("xrc-post-community-wrap")?.classList.toggle("xrc-hidden", byId("xrc-post-destination")?.value !== "community");
  }
  function normalizeCommunity(value) {
    const raw = String(value || "").trim();
    if (/^\d+$/.test(raw)) return `https://x.com/i/communities/${raw}`;
    try {
      const url = new URL(raw);
      const match = url.pathname.match(/^\/i\/communities\/(\d+)/);
      return match ? `https://x.com/i/communities/${match[1]}` : "";
    } catch { return ""; }
  }
  function communityId(value) { return normalizeCommunity(value).match(/\/communities\/(\d+)/)?.[1] || ""; }
  function renderPostImageLibrary() {
    const list = byId("xrc-post-image-list");
    if (!list) return;
    const images = Array.isArray(state.settings.postImageLibrary) ? state.settings.postImageLibrary : [];
    list.innerHTML = images.length ? images.map((item, index) => `<div class="xrc-image-item" title="${escapeAttr(item.name || `${localizeText("图片")} ${index + 1}`)}"><img src="${escapeAttr(item.dataUrl)}" alt=""><button data-act="remove-post-image" data-index="${index}" title="${localizeText("删除")}">×</button></div>`).join("") : `<div class="xrc-image-empty">${localizeText("尚未添加发帖图片")}</div>`;
  }
  async function addPostImages(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const valid = files.filter((file) => allowed.has(file.type) && file.size <= 5 * 1024 * 1024);
    if (!valid.length) { byId("xrc-post-image-files").value = ""; return toast("请选择 JPG、PNG、WebP 或 GIF；单张不能超过 5MB", true); }
    const remaining = Math.max(0, 20 - (state.settings.postImageLibrary?.length || 0));
    const selected = valid.slice(0, remaining);
    if (!selected.length) { byId("xrc-post-image-files").value = ""; return toast("发帖图片库最多保存 20 张", true); }
    const added = await Promise.all(selected.map(async (file) => ({ id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`, name: file.name, type: file.type, dataUrl: await fileToDataUrl(file) })));
    state.settings.postImageLibrary = [...(state.settings.postImageLibrary || []), ...added];
    await chrome.storage.local.set({ postImageLibrary: state.settings.postImageLibrary });
    await syncSelectedProfileImageLibrary("post");
    byId("xrc-post-image-files").value = "";
    renderPostImageLibrary();
    toast(`已添加 ${added.length} 张发帖图片`);
  }
  async function removePostImage(index) {
    const images = [...(state.settings.postImageLibrary || [])];
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1);
    state.settings.postImageLibrary = images;
    await chrome.storage.local.set({ postImageLibrary: images });
    await syncSelectedProfileImageLibrary("post");
    renderPostImageLibrary();
  }
  async function startAutoPost() {
    if (state.postRunning) return;
    const values = await savePostSettings();
    if (!values) return;
    const active = await chrome.storage.local.get(["autoJob", "postJob", "replyLoopJob"]);
    if (active.autoJob?.active) return toast("请先结束自动评论任务，再启动自动发帖", true);
    if (active.replyLoopJob?.active) return toast("请先终止循环评论任务，再启动自动发帖", true);
    if (active.postJob?.active) return resumePostJob(active.postJob);
    const contents = uniquePostContents(parseSpecifiedReplies(values.postSpecifiedContents));
    if (values.postSource === "specified" && !contents.length) return toast("请先填写至少一条指定发帖内容", true);
    if (values.postSource === "ai" && !values.postAiPrompt) return toast("请先填写 AI 发帖提示词", true);
    const target = values.postLoopEnabled ? values.postLoopTotalLimit : values.autoPostCount;
    const job = {
      active: true, paused: false, sent: 0, skipped: 0, current: 0,
      target, requestedTarget: values.autoPostCount, source: values.postSource, contents,
      loop: values.postLoopEnabled, totalLimit: values.postLoopTotalLimit,
      batchSize: values.autoPostCount, roundIntervalMinutes: values.postLoopRoundIntervalMinutes,
      emptyRoundLimit: values.postLoopEmptyRoundLimit, emptyRounds: 0, rounds: 0, batchStartSent: 0,
      order: values.postSpecifiedOrder, prompt: values.postAiPrompt,
      maxChars: values.postMaxChars, delayMode: values.postDelayMode,
      delaySeconds: values.postDelaySeconds, randomDelayMin: values.postRandomDelayMin,
      randomDelayMax: values.postRandomDelayMax, imageUseChance: values.postImageUseChance,
      imageCount: values.postImageCount || 1, imageSelectionMode: values.postImageSelectionMode || "random",
      imageLibrary: state.settings.postImageLibrary || [], destination: values.postDestination,
      community: values.postCommunity, returnUrl: location.href, ownerTabId: state.tabId,
      accountId: state.accountId, leaseUntil: Date.now() + 90000, failureStreak: 0,
      startedAt: Date.now()
    };
    await chrome.storage.local.set({ postJob: job });
    switchTab("posting");
    await navigatePostJob(job);
  }
  async function resumePostJob(job) {
    if (!job?.active || state.postRunning) return;
    if (!await claimJobLease(job, "postJob")) return;
    state.postRunning = true;
    switchTab("posting");
    const latest = await waitUntilPostResumed();
    if (!latest) return;
    Object.assign(job, latest);
    if (job.source === "specified") {
      job.contents = uniquePostContents(job.contents || []);
      job.target = job.loop
        ? Math.max(1, Number(job.totalLimit || job.target || 1))
        : Math.max(1, Number(job.requestedTarget || job.target || 1));
      delete job.usedContentIndexes;
      delete job.pendingContentIndex;
      await chrome.storage.local.set({ postJob: job });
    }
    showPostJobBar(`自动发帖 · 已发布 ${job.sent}/${job.target} · 已跳过 ${job.skipped || 0}`);
    if (job.loop ? job.sent >= job.totalLimit : job.current >= job.target) return finishPostJob(job, `自动发帖处理完成：发布 ${job.sent} 条，跳过 ${job.skipped || 0} 条`);
    if (!isPostDestinationPage(job)) { state.postRunning = false; return navigatePostJob(job); }
    if (job.destination === "community" && !isVerifiedCommunityRoute(job)) {
      return pausePostJobWithReason(job, "无法确认目标社区，已暂停以避免误发到公开时间线");
    }
    const editor = job.destination === "community"
      ? await openVerifiedCommunityComposer(job)
      : await waitForReplyEditor(30000);
    if (!editor) {
      const current = (await chrome.storage.local.get("postJob")).postJob;
      if (current?.navigatingComposer) { state.postRunning = false; return; }
      if (current?.paused) { state.postRunning = false; return; }
      return retryPostStep(job, "未找到发帖输入框", 2);
    }
    const existing = readEditorText(editor);
    if (existing) return pausePostJobWithReason(job, "发帖框中已有草稿，请手动清空后继续");
    const content = await choosePostContent(job);
    if (!content) {
      if (job.source === "specified") return finishPostJob(job, `固定发帖内容已全部使用，共发布 ${job.sent} 条`);
      return retryPostStep(job, "没有获得可用的发帖内容", 2);
    }
    const text = fitReply(normalizeForXEditor(content), job.maxChars);
    const fillResult = await replaceEditorText(editor, text);
    let activeEditor = fillResult.editor;
    if (!fillResult.complete) return retryPostStep(job, "发帖内容填入失败", 2, activeEditor);
    await maybeAttachPostImage(job, activeEditor);
    activeEditor = activeEditor?.isConnected ? activeEditor : findReplyEditor();
    if (!editorTextMatches(readEditorText(activeEditor), text)) {
      const restored = await replaceEditorText(activeEditor, text);
      activeEditor = restored.editor;
      if (!restored.complete) return retryPostStep(job, "图片载入后发帖文字丢失", 2, activeEditor);
    }
    const sendButton = await waitForStrictSendButton(20000, activeEditor);
    if (!sendButton || !scopeContainsElement(activeEditor, sendButton)) return retryPostStep(job, "发布按钮不在当前发帖框中", 2, activeEditor);
    const resumed = await waitUntilPostResumed();
    if (!resumed) return;
    if (!await waitForSendWindow("post", job, "postJob")) return;
    sendButton.click();
    showPostJobBar(`正在确认第 ${job.sent + 1}/${job.target} 条帖子…`);
    const submission = await waitForReplySubmission(30000, text, false);
    if (submission === "duplicate") {
      await clearPostComposer();
      job.skipped = (job.skipped || 0) + 1;
      job.current += 1;
      await chrome.storage.local.set({ postJob: job });
      return continuePostJob(job);
    }
    if (submission !== "sent") return retryPostStep(job, submission === "failed" ? "X 返回发布失败" : "无法确认帖子是否发布", 2);
    job.sent += 1;
    job.current += 1;
    job.retries = 0;
    job.failureStreak = 0;
    await recordSuccessfulSend("post");
    if (state.settings.autoLikePost) likeMostRecentOwnPost().catch(() => {});
    await chrome.storage.local.set({ postJob: job });
    return continuePostJob(job);
  }

  async function continuePostJob(job) {
    if (!job.loop) {
      if (job.current >= job.target) return finishPostJob(job, `自动发帖处理完成：发布 ${job.sent} 条，跳过 ${job.skipped || 0} 条`);
      const seconds = choosePostDelay(job);
      showPostJobBar(`已发布 ${job.sent}/${job.target}，等待 ${seconds} 秒后发布下一条`);
      const waited = await waitPostDelay(job, seconds);
      if (!waited) return;
      state.postRunning = false;
      return navigatePostJob(job);
    }
    if (job.sent >= job.totalLimit) return finishPostJob(job, `循环发帖已达到总上限 ${job.totalLimit}`);
    const batchSize = Math.max(1, Number(job.batchSize) || 1);
    const atBatchBoundary = job.current > 0 && job.current % batchSize === 0;
    let waitSeconds = choosePostDelay(job);
    if (atBatchBoundary) {
      const batchSent = job.sent - (job.batchStartSent || 0);
      job.rounds = (job.rounds || 0) + 1;
      job.emptyRounds = batchSent > 0 ? 0 : (job.emptyRounds || 0) + 1;
      job.batchStartSent = job.sent;
      await chrome.storage.local.set({ postJob: job });
      if (job.emptyRounds >= job.emptyRoundLimit) {
        return finishPostJob(job, `连续 ${job.emptyRounds} 个批次没有成功发布，循环已停止`);
      }
      waitSeconds = Math.max(1, Number(job.roundIntervalMinutes) || 1) * 60;
      showPostJobBar(`第 ${job.rounds} 批完成：已发布 ${job.sent}/${job.totalLimit}，等待 ${job.roundIntervalMinutes} 分钟`);
    } else {
      showPostJobBar(`循环发帖：已发布 ${job.sent}/${job.totalLimit}，等待 ${waitSeconds} 秒`);
    }
    const waited = await waitPostDelay(job, waitSeconds);
    if (!waited) return;
    state.postRunning = false;
    return navigatePostJob(job);
  }
  async function choosePostContent(job) {
    if (job.source === "ai") {
      try {
        const response = await chrome.runtime.sendMessage({ type: "POST_AI_REQUEST", payload: { prompt: job.prompt, maxChars: job.maxChars } });
        if (!response?.ok) { const failure = response?.error || { code: "providerError", detail: "Unknown error" }; throw Object.assign(new Error(failure.detail || failure.message || "Unknown error"), failure); }
        return response.data?.posts?.[0] || "";
      } catch (error) {
        toast(localizeError(error), true);
        return "";
      }
    }
    if (!job.contents?.length) return "";
    if (job.order === "random") {
      const index = Math.floor(Math.random() * job.contents.length);
      job.lastContentIndex = index;
      await chrome.storage.local.set({ postJob: job });
      return job.contents[index];
    }
    const index = Math.max(0, Number(job.current || 0)) % job.contents.length;
    return job.contents[index];
  }
  function uniquePostContents(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      const key = normalizeComparable(value).normalize("NFKC").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function postDestinationPath(job) {
    return job.destination === "community" ? `/i/communities/${communityId(job.community)}` : "/compose/post";
  }
  function isPostDestinationPage(job) {
    if (job.destination !== "community") return location.pathname.startsWith("/compose/post");
    return location.pathname.startsWith(`/i/communities/${communityId(job.community)}`)
      || isVerifiedCommunityRoute(job);
  }
  function isVerifiedCommunityRoute(job) {
    const id = communityId(job.community);
    if (!id) return false;
    if (location.pathname.startsWith(`/i/communities/${id}`)) return true;
    return location.pathname.startsWith("/compose/post")
      && (new URLSearchParams(location.search).get("community_id") === id || job.navigatingComposer === true);
  }
  async function navigatePostJob(job) {
    const target = job.destination === "community" ? normalizeCommunity(job.community) : "https://x.com/compose/post";
    if (!target) return pausePostJobWithReason(job, "社区地址无效");
    location.href = target;
  }
  async function openVerifiedCommunityComposer(job) {
    const id = communityId(job.community);
    if (!id || !isVerifiedCommunityRoute(job)) return null;
    const onCommunityPage = location.pathname.startsWith(`/i/communities/${id}`);
    const communityName = onCommunityPage ? readCommunityName() : (job.communityName || "");
    let editor = findReplyEditor();
    if (!onCommunityPage && !editor) editor = await waitForReplyEditor(30000);
    if (!editor) {
      const compose = [...document.querySelectorAll(
        '[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], button'
      )].filter(isVisibleElement).find((element) => {
        if (element.matches('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"]')) return true;
        return /^(发帖|发布|post)$/i.test(String(element.innerText || element.textContent || "").trim());
      });
      if (compose) {
        compose.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        compose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        compose.click();
        editor = await waitForReplyEditor(6000);
      }
      if (!editor && onCommunityPage) {
        job.communityName = communityName || job.communityName || "";
        job.navigatingComposer = true;
        await chrome.storage.local.set({ postJob: job });
        location.href = `https://x.com/compose/post?community_id=${encodeURIComponent(id)}`;
        return null;
      }
    }
    if (!editor) return null;
    delete job.navigatingComposer;
    await chrome.storage.local.set({ postJob: job });
    const dialog = editor.closest('[role="dialog"]') || findComposerContainer(editor);
    const audienceButton = findAudienceButton(dialog, communityName);
    if (!audienceButton) {
      await clearPostComposer();
      return pausePostJobWithReason(job, "已打开发帖框，但未找到受众选择器；为避免公开误发，任务已暂停");
    }
    if (audienceMatchesCommunity(audienceButton, communityName)) return editor;
    audienceButton.click();
    const selected = await chooseCommunityAudience(id, communityName, 10000);
    if (!selected) {
      await clearPostComposer();
      return pausePostJobWithReason(job, "无法在受众列表中选中目标社区；请确认账号已加入该社区");
    }
    await delay(500);
    // chooseCommunityAudience only returns true after clicking a high-confidence
    // target row matched by community name or member-count metadata. X rebuilds
    // the composer DOM after that click, so querying the old dialog again can
    // return a stale/wrong button even though the visible audience is correct.
    job.communityName = communityName || job.communityName || "";
    job.communityAudienceSelected = true;
    await chrome.storage.local.set({ postJob: job });
    return await waitForReplyEditor(5000) || editor;
  }
  function readCommunityName() {
    const main = document.querySelector('main');
    const candidates = [...(main || document).querySelectorAll('h1, h2, [role="heading"]')]
      .filter(isVisibleElement)
      .map((element) => String(element.innerText || element.textContent || "").trim())
      .filter((text) => text && !/^(主页|帖子|社区|home|posts?|community)$/i.test(text));
    return candidates[0] || "";
  }
  function findAudienceButton(scope, communityName) {
    const candidates = [...(scope || document).querySelectorAll(
      '[data-testid="audienceSelectorButton"], button, [role="button"]'
    )].filter(isVisibleElement);
    return candidates.find((element) => element.matches('[data-testid="audienceSelectorButton"]'))
      || candidates.find((element) => {
        const text = String(element.innerText || element.textContent || "").trim();
        if (/回复|reply/i.test(text) || text.length > 100) return false;
        return /^(所有人|每个人|任何人|everyone)$/i.test(text)
          || /受众|audience|社区|community/i.test(text)
          || Boolean(communityName && text.toLowerCase().includes(communityName.toLowerCase()));
      });
  }
  function audienceMatchesCommunity(button, communityName) {
    const text = String(button?.innerText || button?.textContent || "").trim();
    if (!text || /^(所有人|每个人|任何人|everyone)$/i.test(text)) return false;
    if (/^(受众|选择受众|audience|choose audience)$/i.test(text) || /回复|reply/i.test(text)) return false;
    if (!communityName) return true;
    const actual = normalizeAudienceText(text);
    const expected = normalizeAudienceText(communityName);
    if (actual.includes(expected) || expected.includes(actual)) return true;
    // The community row was selected using the target name/member row above.
    // X can shorten or localize the selected label, so a non-public audience
    // label is sufficient for this second-stage safety check.
    return actual.length > 1;
  }
  async function chooseCommunityAudience(id, communityName, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hrefTarget = [...document.querySelectorAll(`a[href*="/i/communities/${id}"]`)]
        .filter(isVisibleElement)
        .find((element) => !element.closest("#xrc-root"));
      if (hrefTarget) { hrefTarget.click(); return true; }
      const candidates = [...document.querySelectorAll('[role="menuitem"], [role="option"], [role="button"], button, a, [tabindex="0"]')]
        .filter(isVisibleElement)
        .filter((element) => !element.closest("#xrc-root"))
        .map((element) => {
          const text = String(element.innerText || element.textContent || "").trim();
          const normalized = normalizeAudienceText(text);
          const expected = normalizeAudienceText(communityName);
          let score = 0;
          if (!text || text.length > 300 || /选择受众|我的社群|我的社区|choose audience|my communities/i.test(text)) return null;
          if (/^(所有人|每个人|任何人|everyone)$/i.test(text)) return null;
          if (expected && (normalized.includes(expected) || expected.includes(normalized))) score += 100;
          if (/\d[\d,.]*\s*(成员|members?)/i.test(text)) score += 35;
          if (element.querySelector("img")) score += 10;
          if (element.matches('[role="button"], [role="menuitem"], [role="option"], button, a')) score += 5;
          return score > 0 ? { element, score, textLength: text.length } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.textLength - b.textLength);
      const target = candidates[0]?.element;
      if (target) {
        const clickable = target.closest('[role="button"], [role="menuitem"], [role="option"], button, a, [tabindex="0"]') || target;
        clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        clickable.click();
        return true;
      }
      await delay(250);
    }
    return false;
  }
  function normalizeAudienceText(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s"'“”‘’`$]+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  }
  function choosePostDelay(job) {
    if (job.delayMode !== "random") return clamp(job.delaySeconds, 1, 86400, 60);
    const min = clamp(job.randomDelayMin, 1, 86400, 60);
    const max = clamp(job.randomDelayMax, min, 86400, Math.max(min, 180));
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  async function waitPostDelay(job, seconds) {
    if (!job.nextRunAt) {
      job.nextRunAt = Date.now() + seconds * 1000;
      await chrome.storage.local.set({ postJob: job });
    }
    while (Date.now() < job.nextRunAt) {
      const latest = await waitUntilPostResumed();
      if (!latest) return false;
      Object.assign(job, latest);
      await resilientDelay(Math.min(1000, Math.max(0, job.nextRunAt - Date.now())));
    }
    delete job.nextRunAt;
    await chrome.storage.local.set({ postJob: job });
    return true;
  }
  async function waitUntilPostResumed() {
    while (true) {
      const saved = await chrome.storage.local.get("postJob");
      const latest = saved.postJob;
      if (!latest?.active) { state.postRunning = false; return null; }
      if (!latest.paused) { updatePostPauseButton(false); return latest; }
      updatePostPauseButton(true);
      showPostJobBar(`发帖任务已暂停 · 已发布 ${latest.sent || 0}/${latest.target}`);
      await delay(500);
    }
  }
  async function setPostJobPaused(paused) {
    if (paused) {
      runningJobs["postJob"] = null;
      state.postRunning = false;
      for (const wake of [...delayWaiters]) wake();
    }
    const saved = await chrome.storage.local.get("postJob");
    const job = saved.postJob;
    if (!job?.active) return toast("当前没有自动发帖任务", true);
    job.paused = Boolean(paused);
    if (job.paused) { delete job.waitState; delete job.nextRunAt; job._runId = makeRunId(); }
    if (!job.paused) job.retries = 0;
    await chrome.storage.local.set({ postJob: job });
    for (const wake of [...delayWaiters]) wake();
    updatePostPauseButton(job.paused);
    showPostJobBar(job.paused ? `发帖任务已暂停 · 已发布 ${job.sent || 0}/${job.target}` : `发帖任务已继续 · 已发布 ${job.sent || 0}/${job.target}`);
    if (!job.paused && !state.postRunning) resumePostJob(job);
  }
  async function pausePostJobWithReason(job, reason) {
    runningJobs["postJob"] = null;
    for (const wake of [...delayWaiters]) wake();
    job.paused = true;
    delete job.waitState;
    delete job.nextRunAt;
    job._runId = makeRunId();
    job.lastReason = reason;
    await chrome.storage.local.set({ postJob: job });
    state.postRunning = false;
    updatePostPauseButton(true);
    showPostJobBar(reason);
    toast(reason, true);
  }
  async function retryPostStep(job, reason, maxRetries, targetEditor = findReplyEditor()) {
    job.failureStreak = (job.failureStreak || 0) + 1;
    if (job.failureStreak >= Number(state.settings.consecutiveFailureLimit || 5)) {
      return pausePostJobWithReason(job, `${reason}；连续失败达到熔断上限，任务已暂停供检查`);
    }
    job.retries = (job.retries || 0) + 1;
    const cleared = await clearPostComposer(targetEditor);
    if (!cleared) {
      job.retries = 0;
      await chrome.storage.local.set({ postJob: job });
      return pausePostJobWithReason(job, `${reason}；旧草稿无法自动清空，已暂停以避免内容重复`);
    }
    await chrome.storage.local.set({ postJob: job });
    if (job.retries <= maxRetries) {
      showPostJobBar(`${reason}，正在重试 ${job.retries}/${maxRetries}…`);
      await delay(1200);
      state.postRunning = false;
      const fresh = (await chrome.storage.local.get("postJob")).postJob;
      if (!fresh?.active || fresh.paused) return;
      return resumePostJob(fresh);
    }
    job.skipped = (job.skipped || 0) + 1;
    job.current += 1;
    job.retries = 0;
    await chrome.storage.local.set({ postJob: job });
    return pausePostJobWithReason(job, `${reason}，连续重试失败；已暂停供检查`);
  }
  async function cancelPostJob() {
    runningJobs["postJob"] = null;
    for (const wake of [...delayWaiters]) wake();
    const saved = await chrome.storage.local.get("postJob");
    const job = saved.postJob;
    await chrome.storage.local.remove("postJob");
    state.postRunning = false;
    for (const wake of [...delayWaiters]) wake();
    await clearPostComposer();
    showPostJobBar("");
    toast(`自动发帖已结束：发布 ${job?.sent || 0} 条`);
  }
  async function finishPostJob(job, message) {
    await chrome.storage.local.remove("postJob");
    await chrome.storage.local.set({ postLastStatus: message });
    state.postRunning = false;
    showPostJobBar("");
    toast(message);
    if (job.returnUrl && location.href !== job.returnUrl) location.href = job.returnUrl;
  }
  function showPostJobBar(message, meta = "", waiting = false) {
    renderTaskBar("xrc-post-jobbar", message, meta, waiting);
  }
  function updatePostPauseButton(paused) {
    const button = byId("xrc-post-pause");
    if (!button) return;
    button.textContent = localizeText(paused ? "继续" : "暂停");
    button.dataset.act = paused ? "resume-post" : "pause-post";
  }
  async function clearPostComposer(targetEditor = findReplyEditor()) {
    let editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
    if (!editor) return true;
    const originalComposer = findComposerContainer(editor);
    let composer = originalComposer;
    const resolveEditor = () => {
      if (editor?.isConnected && (!originalComposer?.isConnected || originalComposer.contains(editor))) return editor;
      if (originalComposer?.isConnected) return findEditorInComposer(originalComposer);
      return findReplyEditor();
    };
    const initialText = readEditorText(editor);
    const initialMedia = findComposerMediaPreview(editor);
    const initialDirty = composerSendButtonEnabled(editor);
    // Do not send a synthetic deletion into an already-empty X editor. Some
    // Lexical builds leave the selection unusable after that no-op event.
    if (!initialText && !initialMedia && !initialDirty) return true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      editor = resolveEditor();
      if (!editor) return !originalComposer?.isConnected;
      composer = findComposerContainer(editor);
      clickComposerRemoveButtons(composer);
      if (readEditorText(editor)) {
        try {
          editor.focus();
          await delay(50);
          editor = resolveEditor();
          if (!editor) continue;
          selectEditorContents(editor);
          const deleted = document.execCommand("delete", false);
          if (!deleted) document.execCommand("insertText", false, "");
        } catch {
          await delay(100);
          continue;
        }
      }
      await delay(450);
      editor = resolveEditor();
      if (!editor) return !originalComposer?.isConnected;
      composer = findComposerContainer(editor);
      const text = readEditorText(editor);
      const media = findComposerMediaPreview(editor);
      const dirty = composerSendButtonEnabled(editor);
      if (!text && !media && !dirty) return true;
    }
    return false;
  }

  function clickComposerRemoveButtons(scope) {
    if (!scope?.isConnected) return 0;
    const candidates = [...scope.querySelectorAll(
      '[data-testid="removeMedia"], [data-testid="attachments"] button, [data-testid="attachments"] [role="button"], [data-testid="mediaPreview"] button, [data-testid="mediaPreview"] [role="button"]'
    )]
      .filter(isVisibleElement)
      .filter((button) => !button.closest("#xrc-root"))
      .filter((button) => {
        if (button.matches('[data-testid="removeMedia"]')) return true;
        const aria = String(button.getAttribute("aria-label") || "").trim();
        const text = String(button.innerText || button.textContent || "").trim();
        if (/(?:remove|delete|移除|删除).*(?:media|photo|image|attachment|媒体|图片|照片)|(?:media|photo|image|attachment|媒体|图片|照片).*(?:remove|delete|移除|删除)/i.test(aria)) return true;
        return /^(?:×|x)$/i.test(text) || /^(?:close|关闭)$/i.test(aria);
      });
    for (const button of candidates) {
      try { button.click(); } catch {}
    }
    return candidates.length;
  }

  function composerSendButtonEnabled(editor) {
    const button = findSendButtonStrict(editor);
    return Boolean(button && button.getAttribute("aria-disabled") !== "true" && !button.disabled);
  }
  async function maybeAttachPostImage(job, targetEditor = findReplyEditor()) {
    // 委托到统一图片附加函数（发帖图片库）
    return attachImagesToEditor({
      images: Array.isArray(job.imageLibrary) ? job.imageLibrary : [],
      chance: clamp(job.imageUseChance, 0, 100, 50),
      count: clamp(job.imageCount ?? 1, 1, 4, 1),
      mode: job.imageSelectionMode || "random",
      indexKey: "_postImageSeq",
      label: "发帖",
      targetEditor
    });
  }

  // 统一图片附加引擎：支持随机/顺序/全部模式，一次附加多张（X 上限 4 张）
  async function attachImagesToEditor(opts) {
    const { images, chance, count, mode, indexKey, label, targetEditor } = opts;
    if (!images || !images.length) return false;
    if (chance <= 0) return false;
    if (Math.random() * 100 >= chance) return false;

    const maxTake = Math.min(count, images.length, 4);
    let selected;
    if (mode === "all") {
      // 全部发送：取前 maxTake 张（受 count 和 X 4 张上限限制）
      selected = images.slice(0, maxTake);
    } else if (mode === "sequential") {
      let seq = Number(state[indexKey] || 0);
      selected = [];
      for (let n = 0; n < maxTake; n++) {
        selected.push(images[seq % images.length]);
        seq += 1;
      }
      state[indexKey] = seq;
    } else {
      // random: 从图片库中随机不重复选取
      const pool = [...images];
      selected = [];
      for (let n = 0; n < maxTake && pool.length; n++) {
        const idx = Math.floor(Math.random() * pool.length);
        selected.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    if (!selected.length) return false;

    // 查找文件输入框：只在当前编辑器所属 composer/dialog 范围内查找，避免跨 composer 附加图片
    const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
    const composer = findComposerContainer(editor);
    if (!editor || !composer) { toast(`未找到${label}回复框，本条使用纯文字`, true); return false; }
    let input = findComposerFileInput(editor);
    if (!input) {
      const mediaBtn = findMediaButton(composer);
      if (mediaBtn) { mediaBtn.click(); await delay(700); }
      input = findComposerFileInput(editor);
    }
    if (!input) { toast(`未找到${label}图片控件，本条使用纯文字`, true); return false; }

    try {
      const blobs = await Promise.all(selected.map((img) => fetch(img.dataUrl).then((r) => r.blob())));
      const files = blobs.map((blob, i) => new File([blob],
        selected[i].name || `${label}-image-${i + 1}.${selected[i].type === "image/png" ? "png" : "jpg"}`,
        { type: selected[i].type || blob.type || "image/jpeg" }));
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return waitForMediaReadyStrict(20000, editor);
    } catch (error) {
      toast(`${label}图片添加失败，本条使用纯文字：${error.message}`, true);
      return false;
    }
  }
  async function waitForMediaReadyStrict(timeoutMs, targetEditor) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
      if (!editor) return false;
      const preview = findComposerMediaPreview(editor);
      const button = findSendButtonStrict(editor);
      if (preview && button) return true;
      await delay(300);
    }
    return false;
  }
  function renderImageLibrary() {
    const list = byId("xrc-image-list");
    if (!list) return;
    const images = Array.isArray(state.settings.imageLibrary) ? state.settings.imageLibrary : [];
    list.innerHTML = images.length ? images.map((item, index) => `<div class="xrc-image-item" title="${escapeAttr(item.name || `${localizeText("图片")} ${index + 1}`)}"><img src="${escapeAttr(item.dataUrl)}" alt=""><button data-act="remove-image" data-index="${index}" title="${localizeText("删除")}">×</button></div>`).join("") : `<div class="xrc-image-empty">${localizeText("尚未添加图片")}</div>`;
  }
  async function addImages(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const valid = files.filter((file) => allowed.has(file.type) && file.size <= 5 * 1024 * 1024);
    if (!valid.length) { byId("xrc-image-files").value = ""; return toast("请选择 JPG、PNG、WebP 或 GIF；单张不能超过 5MB", true); }
    const remaining = Math.max(0, 20 - (state.settings.imageLibrary?.length || 0));
    const selected = valid.slice(0, remaining);
    if (!selected.length) { byId("xrc-image-files").value = ""; return toast("图片库最多保存 20 张", true); }
    const added = await Promise.all(selected.map(async (file) => ({ id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`, name: file.name, type: file.type, dataUrl: await fileToDataUrl(file) })));
    state.settings.imageLibrary = [...(state.settings.imageLibrary || []), ...added];
    await chrome.storage.local.set({ imageLibrary: state.settings.imageLibrary });
    await syncSelectedProfileImageLibrary("reply");
    byId("xrc-image-files").value = "";
    renderImageLibrary();
    toast(`已添加 ${added.length} 张图片`);
  }
  async function removeImage(index) {
    const images = [...(state.settings.imageLibrary || [])];
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1); state.settings.imageLibrary = images;
    await chrome.storage.local.set({ imageLibrary: images });
    await syncSelectedProfileImageLibrary("reply");
    renderImageLibrary();
  }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error("读取图片失败")); reader.readAsDataURL(file); }); }
  async function maybeAttachRandomImage(job, targetEditor = findReplyEditor()) {
    // 委托到统一图片附加函数（评论图片库）
    return attachImagesToEditor({
      images: Array.isArray(state.settings.imageLibrary) ? state.settings.imageLibrary : [],
      chance: clamp(job.imageUseChance ?? state.settings.imageUseChance, 0, 100, 50),
      count: clamp(job.imageCount ?? state.settings.imageCount ?? 1, 1, 4, 1),
      mode: job.imageSelectionMode || state.settings.imageSelectionMode || "random",
      indexKey: "_replyImageSeq",
      label: "评论",
      targetEditor
    });
  }
  async function waitForMediaReady(timeoutMs, targetEditor = findReplyEditor()) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
      const composer = findComposerContainer(editor);
      const preview = composer?.querySelector('[data-testid="attachments"], [data-testid="removeMedia"], [data-testid="mediaPreview"], img[src^="blob:"]');
      const button = findSendButton(editor);
      if (preview && button && button.getAttribute("aria-disabled") !== "true" && !button.disabled) return true;
      await delay(300);
    }
    return false;
  }
  async function waitForReplySubmission(timeoutMs, expectedText, allowRecentOwnPost = true) {
    const deadline = Date.now() + timeoutMs;
    const sendTime = Date.now();
    await delay(400);
    while (Date.now() < deadline) {
      const pageText = String(document.querySelector("main")?.innerText || "");
      if (/你已经发过了|you(?:'ve| have)? already (?:sent|posted)/i.test(pageText)) return "duplicate";
      if (hasRecentMatchingReply(expectedText)) return "sent";
      if (/出错了.{0,30}(?:再试一次|try again)|something went wrong/i.test(pageText)) return "failed";
      // After 6s without full-text match, accept any recent self-post as sent.
      if (allowRecentOwnPost && Date.now() - sendTime > 6000 && hasAnyRecentOwnPost(30000)) {
        const editor = findReplyEditor();
        if (!editor || !readEditorText(editor)) return "sent";
      }
      await delay(250);
    }
    return "timeout";
  }
  async function likeMostRecentOwnPost() {
    const profileHref = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") || "";
    const myHandle = profileHref.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!myHandle) return;
    await delay(1000);
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    for (const article of articles) {
      const time = article.querySelector("time");
      const href = time?.closest('a[href*="/status/"]')?.getAttribute("href") || "";
      const author = href.split("/").filter(Boolean)[0]?.toLowerCase();
      if (author !== myHandle) continue;
      const timestamp = Date.parse(time?.dateTime || "");
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 60000) break;
      // Found the most recent own post — click its like button.
      const likeBtn = article.querySelector('[data-testid="like"]');
      if (!likeBtn || likeBtn.getAttribute("aria-disabled") === "true") continue;
      try { likeBtn.click(); } catch {}
      return;
    }
  }
  function hasAnyRecentOwnPost(timeWindowMs) {
    const profileHref = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") || "";
    const myHandle = profileHref.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!myHandle) return false;
    return [...document.querySelectorAll('article[data-testid="tweet"]')].some((article) => {
      const time = article.querySelector("time");
      const href = time?.closest('a[href*="/status/"]')?.getAttribute("href") || "";
      const author = href.split("/").filter(Boolean)[0]?.toLowerCase();
      if (author !== myHandle) return false;
      const timestamp = Date.parse(time?.dateTime || "");
      return Number.isFinite(timestamp) && Date.now() - timestamp <= timeWindowMs;
    });
  }
  function hasRecentMatchingReply(expectedText) {
    const expected = String(expectedText || "").trim(); if (!expected) return false;
    const profileHref = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") || "";
    const myHandle = profileHref.split("/").filter(Boolean)[0]?.toLowerCase();
    return [...document.querySelectorAll('article[data-testid="tweet"]')].some((article) => {
      const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || "";
      const time = article.querySelector("time");
      const href = time?.closest('a[href*="/status/"]')?.getAttribute("href") || "";
      const author = href.split("/").filter(Boolean)[0]?.toLowerCase();
      const timestamp = Date.parse(time?.dateTime || "");
      const recent = Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= 2 * 60 * 1000;
      return recent && (!myHandle || author === myHandle) && contentLooksComplete(text, expected);
    });
  }
  async function waitForEnabledSendButton(timeoutMs, targetEditor = findReplyEditor()) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
      const button = findSendButton(editor);
      if (button && button.getAttribute("aria-disabled") !== "true" && !button.disabled) return button;
      await delay(250);
    }
    const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
    return findSendButton(editor);
  }
  function chooseJobDelay(job) { if (job.delayMode !== "random") return clamp(job.delaySeconds, 1, 600, 10); const min = clamp(job.randomDelayMin, 1, 600, 10); const max = clamp(job.randomDelayMax, min, 600, Math.max(min, 30)); return Math.floor(Math.random() * (max - min + 1)) + min; }
  function renderTaskBar(barId, message, meta = "", waiting = false) {
    state.taskBars[barId] = message ? { message, meta, waiting } : null;
    const bar = byId(barId);
    if (!bar) return;
    bar.classList.toggle("active", Boolean(message));
    bar.classList.toggle("waiting", Boolean(message && waiting));
    const primary = bar.querySelector(".xrc-jobbar-primary");
    const detail = bar.querySelector(".xrc-jobbar-meta");
    if (primary) primary.textContent = message ? `@${state.accountId} · ${localizeText(message)}` : "";
    if (detail) {
      detail.textContent = meta ? localizeText(meta) : "";
      detail.hidden = !meta;
    }
  }
  function showJobBar(message, meta = "", waiting = false) { renderTaskBar("xrc-jobbar", message, meta, waiting); }
  function byId(id) { return root.querySelector(`#${id}`); }
  function splitTerms(value) { return String(value || "").split(/[,，\n]/).map((x) => x.trim()).filter(Boolean); }
  function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback; }
  function findReplyEditor() {
    const editors = [...document.querySelectorAll('[role="dialog"] [data-testid="tweetTextarea_0"][contenteditable="true"], [role="dialog"] [data-testid="tweetTextarea_0"] [contenteditable="true"], [role="dialog"] [contenteditable="true"], [data-testid="tweetTextarea_0"][contenteditable="true"], [data-testid="tweetTextarea_0"] [contenteditable="true"]')].filter(isVisibleElement);
    return editors.sort((a, b) => elementPriority(b) - elementPriority(a))[0] || null;
  }
  function findReplyRestrictionDialog() {
    return [...document.querySelectorAll('[role="dialog"], [data-testid="sheetDialog"]')]
      .filter(isVisibleElement)
      .find((dialog) => {
        if (dialog.closest("#xrc-root")) return false;
        const text = String(dialog.innerText || dialog.textContent || "").replace(/\s+/g, " ").trim();
        return /who can reply\?|只有部分账号可以回复|仅部分账号可以回复|you (?:cannot|can't|can’t) reply|not allowed to reply|only (?:some|certain) accounts can reply/i.test(text);
      }) || null;
  }
  async function dismissReplyRestrictionDialog(dialog = findReplyRestrictionDialog()) {
    if (!dialog) return false;
    const buttons = [...dialog.querySelectorAll('button, [role="button"]')].filter(isVisibleElement);
    const confirm = buttons.find((button) => /^(知道了|我知道了|确定|好的|got it|ok|close)$/i.test(String(button.innerText || button.textContent || "").trim()))
      || dialog.querySelector('[data-testid="confirmationSheetConfirm"], [aria-label="Close"], [aria-label="关闭"]');
    confirm?.click();
    await delay(350);
    return true;
  }
  async function waitForReplyEditorOrRestriction(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const editor = findReplyEditor();
      if (editor?.isConnected) return { editor, restricted: false, dialog: null };
      const dialog = findReplyRestrictionDialog();
      if (dialog) return { editor: null, restricted: true, dialog };
      await delay(250);
    }
    return { editor: null, restricted: false, dialog: null };
  }
  function findComposerContainer(editor) {
    if (!editor) return null;
    const sendSelector = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
    let node = editor;
    while (node && node !== document.body) {
      if ([...(node.querySelectorAll?.(sendSelector) || [])].some(isVisibleElement)) return node;
      node = node.parentElement;
    }
    return editor.closest('[role="dialog"]') || editor.parentElement;
  }
  function findEditorInComposer(composer) {
    if (!composer?.isConnected) return null;
    const selector = '[data-testid="tweetTextarea_0"][contenteditable="true"], [data-testid="tweetTextarea_0"] [contenteditable="true"], [contenteditable="true"]';
    const editors = [...composer.querySelectorAll(selector)].filter(isVisibleElement);
    return editors.sort((a, b) => elementPriority(b) - elementPriority(a))[0] || null;
  }
  async function waitForReplyEditor(timeoutMs) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const editor = findReplyEditor(); if (editor && editor.isConnected) return editor; await delay(250); } return null; }
  async function waitForTweetPage(tweet, timeoutMs) { const deadline = Date.now() + timeoutMs; const statusId = new URL(tweet.url).pathname.split("/").filter(Boolean).pop(); while (Date.now() < deadline) { if (findReplyEditor()) return true; const article = [...document.querySelectorAll('article[data-testid="tweet"]')].find((item) => item.querySelector(`a[href*="/status/${statusId}"]`)); if (article) return true; await delay(500); } return false; }
  async function clearReplyEditor(targetEditor = findReplyEditor()) {
    const editor = targetEditor?.isConnected ? targetEditor : findReplyEditor();
    if (!editor) return true;
    const composer = findComposerContainer(editor);
    if (!await clearPostComposer(editor)) return false;
    const dialog = editor.closest('[role="dialog"]');
    if (dialog?.isConnected) {
      const closeBtn = dialog.querySelector('[data-testid="app-bar-close"], [aria-label="Close"], [aria-label="关闭"]');
      if (closeBtn && isVisibleElement(closeBtn)) {
        closeBtn.click();
        await delay(350);
      }
    }
    const active = composer?.isConnected ? findEditorInComposer(composer) : null;
    if (!active) return true;
    return !readEditorText(active) && !findComposerMediaPreview(active) && !composerSendButtonEnabled(active);
  }

  // 查找编辑器附近的图片/媒体上传按钮
  function findMediaButton(scope) {
    if (!scope) return null;
    // X 的媒体按钮常见特征
    const candidates = [...(scope.querySelectorAll('button, [role="button"], a[role="link"]') || [])]
      .filter(isVisibleElement);
    return candidates.find((btn) => {
      const aria = String(btn.getAttribute('aria-label') || '').toLowerCase();
      const text = String(btn.innerText || btn.textContent || '').toLowerCase();
      return /media|photo|image|gif|picture|attach|upload|媒体|图片|照片|附加/i.test(aria + ' ' + text);
    }) || null;
  }

  function isVisibleElement(element) { if (!element?.isConnected || element.closest('[aria-hidden="true"]')) return false; const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; }
  function elementPriority(element) { const rect = element.getBoundingClientRect(); return (element.closest('[role="dialog"]') ? 100000 : 0) + Math.max(0, rect.bottom); }
  function selectEditorContents(editor) { const selection = window.getSelection(); if (!selection || !editor?.isConnected) throw new Error("回复框已被 X 重建"); const range = document.createRange(); range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range); }
  function placeEditorCaretAtEnd(editor) {
    const selection = window.getSelection();
    if (!selection || !editor?.isConnected) throw new Error("回复框已被 X 重建");
    const offsetSelector = '[data-offset-key]';
    const offsetLeaves = [...editor.querySelectorAll(offsetSelector)]
      .filter((node) => !node.querySelector(offsetSelector))
      .filter(isVisibleElement);
    const block = offsetLeaves.at(-1) || editor.querySelector('[data-contents="true"] > :last-child') || editor;
    const range = document.createRange();
    const placeholderBreak = block.querySelector?.('br[data-text="true"], br');
    if (placeholderBreak?.parentNode) range.setStartBefore(placeholderBreak);
    else { range.selectNodeContents(block); range.collapse(false); }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function readEditorText(editor) {
    return readEditorTextDetails(editor).text;
  }
  function readEditorTextDetails(editor) {
    if (!editor) return { text: "", leafText: "", rawText: "", leafCount: 0 };
    const leafSelector = '[data-text="true"], [data-lexical-text="true"]';
    const leaves = [...editor.querySelectorAll(leafSelector)]
      // Some X builds nest two text markers around the same characters. Keep
      // only the innermost marker so one rendered run is counted once.
      .filter((node) => !node.querySelector(leafSelector))
      .filter(isVisibleElement);
    const leafText = cleanEditorText(leaves.map((node) => node.textContent || "").join(""));
    const rawText = cleanEditorText(editor.innerText || editor.textContent || "");
    return { text: leafText || rawText, leafText, rawText, leafCount: leaves.length };
  }
  function cleanEditorText(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF\uFFFC]/g, "")
      .trim();
  }
  function editorTextMatches(actual, expected) {
    const clean = (value) => normalizeComparable(cleanEditorText(value)).normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF\uFFFC]/g, "");
    const actualClean = clean(actual);
    const expectedClean = clean(expected);
    if (!expectedClean || !actualClean) return false;
    if (actualClean === expectedClean) return true;
    // X may split mentions, cashtags and Unicode runs into several editor
    // nodes and insert layout whitespace between them. Ignore only whitespace;
    // every non-whitespace character must still be present and in order.
    return actualClean.replace(/\s+/g, "") === expectedClean.replace(/\s+/g, "");
  }
  async function replaceEditorText(editor, text) {
    let activeEditor = editor?.isConnected ? editor : findReplyEditor();
    if (!activeEditor) return { editor: null, text: "", complete: false };
    const composer = findComposerContainer(activeEditor);
    let actualText = "";
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      activeEditor = activeEditor?.isConnected ? activeEditor : (findEditorInComposer(composer) || findReplyEditor());
      if (!activeEditor) break;
      actualText = readEditorText(activeEditor);
      // A non-empty mismatch must never be retried: another insertion could
      // append a second copy. The second attempt is allowed only after the
      // first one left the editor visibly and internally empty.
      if (actualText) break;
      try {
        activeEditor.focus();
        // X may replace the contenteditable node synchronously on focus,
        // especially in the modal reply composer. Reacquire it before setting
        // the selection so the range never targets a detached node.
        await delay(50);
        activeEditor = activeEditor?.isConnected ? activeEditor : (findEditorInComposer(composer) || findReplyEditor());
        if (!activeEditor) throw new Error("聚焦后未找到回复框");
        if (attempt === 0) selectEditorContents(activeEditor);
        else placeEditorCaretAtEnd(activeEditor);
        document.execCommand("insertText", false, text);
      } catch (error) {
        lastError = String(error?.message || error || "输入失败");
        continue;
      }
      const deadline = Date.now() + 1200;
      while (Date.now() < deadline) {
        await delay(100);
        activeEditor = activeEditor?.isConnected ? activeEditor : (findEditorInComposer(composer) || findReplyEditor());
        if (!activeEditor) break;
        actualText = readEditorText(activeEditor);
        if (editorTextMatches(actualText, text)) {
          return { editor: activeEditor, text, actualText, complete: true, method: `insertText-${attempt + 1}` };
        }
        if (actualText) break;
      }
      if (actualText) break;
    }
    return { editor: activeEditor, text, actualText, complete: false, method: "none", error: lastError };
  }
  function fitReply(value, limit) { const text = String(value || "").trim(); const max = Math.max(20, Math.min(280, Number(limit) || 280)); if ([...text].length <= max) return text; return [...text].slice(0, Math.max(1, max - 1)).join("").replace(/[\s,;:.-]+$/, "") + "…"; }
  function formatSearchTerm(term) { return /\s/.test(term) ? `"${term.replace(/"/g, "")}\"` : term; }
  function daysAgoDate(days) { const date = new Date(); date.setDate(date.getDate() - days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function parseMetric(value) { const s = String(value).replace(/,/g, ""); const m = s.match(/([\d.]+)\s*([KMB万]?)/i); if (!m) return 0; const mult = { K: 1e3, M: 1e6, B: 1e9, "万": 1e4 }[m[2].toUpperCase()] || 1; return Math.round(Number(m[1]) * mult); }
  function formatNumber(n) { return Intl.NumberFormat(state.locale === "zh-CN" ? "zh-CN" : "en-US", { notation: "compact" }).format(n); }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  async function detectCurrentAccountId(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const links = [...document.querySelectorAll(
        'a[data-testid="AppTabBar_Profile_Link"], a[aria-label*="Profile"], a[aria-label*="个人资料"]'
      )];
      for (const link of links) {
        const path = String(link.getAttribute("href") || "").split("?")[0];
        const match = path.match(/^\/([A-Za-z0-9_]{1,15})$/);
        if (match) return match[1].toLowerCase();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return "unknown";
  }
  function usageStorageKey() { return `xrcUsage:${state.accountId || "unknown"}`; }
  function currentUsageBuckets(now = new Date()) {
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { day, hour: `${day}T${String(now.getHours()).padStart(2, "0")}` };
  }
  async function readUsage() {
    const key = usageStorageKey();
    const stored = await chrome.storage.local.get(key);
    return stored[key] && typeof stored[key] === "object" ? stored[key] : {};
  }
  async function recordSuccessfulSend(kind) {
    const key = usageStorageKey();
    const usage = await readUsage();
    const { day, hour } = currentUsageBuckets();
    usage.day = usage.day === day ? day : day;
    usage.hour = usage.hour === hour ? hour : hour;
    if (usage.lastDay !== day) {
      usage.replyDay = 0;
      usage.postDay = 0;
      usage.lastDay = day;
    }
    if (usage.lastHour !== hour) {
      usage.replyHour = 0;
      usage.postHour = 0;
      usage.lastHour = hour;
    }
    usage[`${kind}Hour`] = (usage[`${kind}Hour`] || 0) + 1;
    usage[`${kind}Day`] = (usage[`${kind}Day`] || 0) + 1;
    usage.lastSentAt = Date.now();
    await chrome.storage.local.set({ [key]: usage });
  }
  function nextActiveTime(now = new Date()) {
    if (!state.settings.activeHoursEnabled) return 0;
    const toMinutes = (value) => {
      const [hours, minutes] = String(value || "00:00").split(":").map(Number);
      return Math.max(0, Math.min(1439, (hours || 0) * 60 + (minutes || 0)));
    };
    const start = toMinutes(state.settings.activeHourStart);
    const end = toMinutes(state.settings.activeHourEnd);
    const current = now.getHours() * 60 + now.getMinutes();
    const active = start === end || (start < end ? current >= start && current < end : current >= start || current < end);
    if (active) return 0;
    const next = new Date(now);
    next.setSeconds(0, 0);
    if (start < end ? current >= end : current >= end && current < start) next.setDate(next.getDate() + 1);
    next.setHours(Math.floor(start / 60), start % 60, 0, 0);
    return next.getTime();
  }
  function formatWaitCountdown(milliseconds) {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    if (state.locale === "en-US") {
      if (seconds < 60) return `${seconds} sec`;
      const minutes = Math.floor(seconds / 60), remainingSeconds = seconds % 60;
      if (minutes < 60) return remainingSeconds ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`;
      const hours = Math.floor(minutes / 60), remainingMinutes = minutes % 60;
      return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
    }
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return remainingSeconds ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`;
  }
  function formatWaitResumeTime(timestamp) {
    const target = new Date(timestamp);
    const now = new Date();
    const sameDay = target.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = target.toDateString() === tomorrow.toDateString();
    const time = new Intl.DateTimeFormat(state.locale === "zh-CN" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(target);
    if (state.locale === "en-US") {
      if (sameDay) return `Today ${time}`;
      if (isTomorrow) return `Tomorrow ${time}`;
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(target);
    }
    if (sameDay) return `今天 ${time}`;
    if (isTomorrow) return `明天 ${time}`;
    return `${target.getMonth() + 1} 月 ${target.getDate()} 日 ${time}`;
  }
  function getActiveHoursLabel() { return `${state.settings.activeHourStart || "00:00"}–${state.settings.activeHourEnd || "00:00"}`; }
  async function getSendWindowState(kind, now = new Date()) {
    if (!state.settings.safeguardsEnabled) return { blocked: false, wakeAt: null, reasons: [], primary: null, hourCount: 0, hourLimit: 0, dayCount: 0, dayLimit: 0 };
    const usage = await readUsage();
    const { day, hour } = currentUsageBuckets(now);
    const hourCount = usage.lastHour === hour ? Number(usage[`${kind}Hour`] || 0) : 0;
    const dayCount = usage.lastDay === day ? Number(usage[`${kind}Day`] || 0) : 0;
    const hourLimit = Number(state.settings[kind === "reply" ? "replyHourlyLimit" : "postHourlyLimit"]) || 1;
    const dayLimit = Number(state.settings[kind === "reply" ? "replyDailyLimit" : "postDailyLimit"]) || 1;
    const reasons = [];
    const activeWakeAt = nextActiveTime(now);
    if (activeWakeAt) reasons.push({ type: "active-hours", wakeAt: activeWakeAt, label: `当前不在活跃时段（${getActiveHoursLabel()}）` });
    if (hourCount >= hourLimit) {
      const nextHour = new Date(now); nextHour.setHours(nextHour.getHours() + 1, 0, 1, 0);
      reasons.push({ type: "hourly-limit", wakeAt: nextHour.getTime(), used: hourCount, limit: hourLimit, label: `${kind === "reply" ? "评论" : "发帖"}已达每小时上限（${hourCount}/${hourLimit}）` });
    }
    if (dayCount >= dayLimit) {
      const nextDay = new Date(now); nextDay.setDate(nextDay.getDate() + 1); nextDay.setHours(0, 0, 1, 0);
      reasons.push({ type: "daily-limit", wakeAt: nextDay.getTime(), used: dayCount, limit: dayLimit, label: `${kind === "reply" ? "评论" : "发帖"}已达每日上限（${dayCount}/${dayLimit}）` });
    }
    const wakeAt = reasons.reduce((latest, reason) => Math.max(latest, reason.wakeAt), 0);
    const primary = reasons.find((reason) => reason.wakeAt === wakeAt) || null;
    return { blocked: Boolean(wakeAt), wakeAt: wakeAt || null, reasons, primary, hourCount, hourLimit, dayCount, dayLimit };
  }
  function renderSendWindowStatus(kind, windowState) {
    const show = kind === "reply" ? showJobBar : showPostJobBar;
    const primary = windowState.primary?.label || "等待运行保护解除";
    const extra = windowState.reasons.length > 1 ? ` · 另有 ${windowState.reasons.length - 1} 项运行保护` : "";
    show(primary, `${formatWaitCountdown(windowState.wakeAt - Date.now())} 后继续 · ${formatWaitResumeTime(windowState.wakeAt)} 自动恢复${extra}`, true);
  }
  function nextWaitRefreshDelay(remainingMs) {
    if (remainingMs <= 60000) return 1000;
    if (remainingMs <= 3600000) return 10000;
    return 30000;
  }
  async function waitForSendWindow(kind, job, storageKey) {
    while (job?.active) {
      if (job.accountId && job.accountId !== "unknown" && state.accountId !== job.accountId) {
        job.paused = true;
        delete job.waitState;
        delete job.nextRunAt;
        job.lastReason = `登录账号不匹配：任务属于 @${job.accountId}，当前为 @${state.accountId}`;
        await chrome.storage.local.set({ [storageKey]: job });
        state.autoRunning = false;
        state.postRunning = false;
        toast(job.lastReason, true);
        return false;
      }
      const windowState = await getSendWindowState(kind);
      if (!windowState.blocked) {
        const hadWaitState = Boolean(job.waitState || job.nextRunAt);
        delete job.waitState;
        delete job.nextRunAt;
        if (hadWaitState) await chrome.storage.local.set({ [storageKey]: job });
        return true;
      }
      const nextWaitState = { kind, wakeAt: windowState.wakeAt, reasonTypes: windowState.reasons.map((reason) => reason.type), primaryType: windowState.primary?.type || "", hour: { used: windowState.hourCount, limit: windowState.hourLimit }, day: { used: windowState.dayCount, limit: windowState.dayLimit } };
      const previousWaitState = job.waitState || {};
      const changed = JSON.stringify({ kind: previousWaitState.kind, wakeAt: previousWaitState.wakeAt, reasonTypes: previousWaitState.reasonTypes, primaryType: previousWaitState.primaryType, hour: previousWaitState.hour, day: previousWaitState.day }) !== JSON.stringify(nextWaitState);
      job.nextRunAt = windowState.wakeAt;
      job.waitState = changed ? { ...nextWaitState, updatedAt: Date.now() } : previousWaitState;
      job.leaseUntil = Date.now() + 90000;
      if (changed) await chrome.storage.local.set({ [storageKey]: job });
      renderSendWindowStatus(kind, windowState);
      const remaining = Math.max(1000, windowState.wakeAt - Date.now());
      await resilientDelay(Math.min(nextWaitRefreshDelay(remaining), remaining));
      const latest = (await chrome.storage.local.get(storageKey))[storageKey];
      if (!latest?.active || latest.paused) return false;
      Object.assign(job, latest);
    }
    return false;
  }
  async function claimJobLease(job, storageKey) {
    if (!job?.active) return false;
    if (!state.tabId) return false;
    // Read the freshest stored job to avoid using a stale in-memory object.
    const stored = await chrome.storage.local.get(storageKey);
    const latest = stored[storageKey];
    if (!latest?.active) return false;
    if (latest.paused) return false;
    if (latest.accountId && latest.accountId !== "unknown" && state.accountId !== latest.accountId) return false;
    const now = Date.now();
    if (latest.ownerTabId != null && latest.ownerTabId !== state.tabId && latest._ownerInstance !== ownerInstanceId && Number(latest.leaseUntil || 0) > now) return false;
    latest.accountId = latest.accountId || state.accountId;
    latest.ownerTabId = state.tabId;
    latest._ownerInstance = ownerInstanceId;
    latest.leaseUntil = now + 90000;
    latest.lastHeartbeatAt = now;
    if (!latest._runId) latest._runId = makeRunId();
    await chrome.storage.local.set({ [storageKey]: latest });
    // Update the caller's job reference with the committed version.
    Object.assign(job, latest);
    chrome.runtime.sendMessage({ type: "XRC_REGISTER_JOB", storageKey, accountId: latest.accountId }).catch(() => {});
    return true;
  }
  async function renewOwnedLeases() {
    const keys = ["autoJob", "postJob", "collectJob", "replyLoopJob"];
    const stored = await chrome.storage.local.get(keys);
    const updates = {};
    for (const key of keys) {
      const job = stored[key];
      if (!job?.active) continue;
      if (job.paused) continue;
      if (job.ownerTabId !== state.tabId || job._ownerInstance !== ownerInstanceId) continue;
      updates[key] = { leaseUntil: Date.now() + 90000, lastHeartbeatAt: Date.now() };
    }
    if (Object.keys(updates).length) {
      // Mutate only lease fields using a narrow merge write.
      const current = await chrome.storage.local.get(Object.keys(updates));
      for (const key of Object.keys(updates)) {
        if (current[key]?.active && !current[key]?.paused && current[key]?.ownerTabId === state.tabId && current[key]?._ownerInstance === ownerInstanceId) {
          current[key].leaseUntil = updates[key].leaseUntil;
          current[key].lastHeartbeatAt = updates[key].lastHeartbeatAt;
        } else {
          delete current[key];
        }
      }
      if (Object.keys(current).length) await chrome.storage.local.set(current);
    }
  }
  function ownsJob(job) {
    if (!job?.active) return false;
    if (!state.tabId) return false;
    if (job.accountId && job.accountId !== "unknown" && state.accountId !== "unknown" && job.accountId !== state.accountId) return false;
    return job.ownerTabId == null || job.ownerTabId === state.tabId || Number(job.leaseUntil || 0) <= Date.now();
  }
  async function restorePersistedJobIfIdle() {
    if (state.autoRunning || state.postRunning || state.collecting) return;
    const saved = await chrome.storage.local.get(["autoJob", "postJob", "collectJob", "replyLoopJob"]);
    if (saved.autoJob?.active && !saved.autoJob.paused && ownsJob(saved.autoJob)) return resumeAutoJob(saved.autoJob);
    if (saved.postJob?.active && !saved.postJob.paused && ownsJob(saved.postJob)) return resumePostJob(saved.postJob);
    if (saved.collectJob?.active && ownsJob(saved.collectJob)) return resumeCollectionJob(saved.collectJob);
    if (saved.replyLoopJob?.active && ownsJob(saved.replyLoopJob)) return resumeReplyLoop(saved.replyLoopJob);
  }
  function resilientDelay(ms) {
    const deadline = Date.now() + Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => {
      let timer;
      const finish = () => {
        clearTimeout(timer);
        delayWaiters.delete(wake);
        resolve();
      };
      const wake = () => {
        if (Date.now() >= deadline) finish();
        else {
          clearTimeout(timer);
          timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
        }
      };
      delayWaiters.add(wake);
      timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
    });
  }
  function delay(ms) { return resilientDelay(ms); }
  function toast(message, error = false) { const el = byId("xrc-toast"); el.textContent = localizeText(message); el.className = error ? "error show" : "show"; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "", 3500); }
  function isExtensionContextInvalidated(error) {
    return /extension context invalidated/i.test(String(error?.message || error || ""));
  }
  function showExtensionReloadNotice() {
    const panel = document.getElementById("xrc-root");
    if (!panel || panel.dataset.contextInvalid === "true") return;
    panel.dataset.contextInvalid = "true";
    const jobBar = panel.querySelector("#xrc-jobbar");
    if (jobBar) {
      jobBar.classList.add("active");
      jobBar.querySelector(".xrc-jobbar-primary").textContent = localizeText("扩展刚刚被重新加载，请刷新当前 X 页面后继续");
      jobBar.querySelector(".xrc-jobbar-meta").hidden = true;
      jobBar.querySelector(":scope > div:last-child").innerHTML = "";
    }
    panel.querySelectorAll("button, input, textarea, select").forEach((element) => {
      if (!element.closest("header")) element.disabled = true;
    });
  }
})();
