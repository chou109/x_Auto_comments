(() => {
  const LOCALES = ["zh-CN", "en-US"];
  const TEXT = {
    "X 自动评论助手": "X Reply Copilot",
    "采集 · 评论 · 发帖": "Collect · Reply · Post",
    "最小化": "Minimize",
    "关闭": "Close",
    "暂停": "Pause",
    "继续": "Resume",
    "结束任务": "End task",
    "结束本轮": "End round",
    "终止循环": "Stop loop",
    "筛选": "Filters",
    "结果": "Results",
    "评论设置": "Reply settings",
    "自动发帖": "Auto post",
    "筛选条件": "Filters",
    "作者与关键词按采集方式分别使用": "Authors and keywords apply to their matching collection methods",
    "作者账号": "Author accounts",
    "填写 @ 后面的账号 ID": "Enter the account ID after @",
    "关键词": "Keywords",
    "逗号分隔，命中任意一个": "Comma-separated; match any keyword",
    "最低点赞": "Minimum likes",
    "最近天数": "Maximum age (days)",
    "结果处理顺序": "Result order",
    "浏览量：高 → 低": "Views: high to low",
    "浏览量：低 → 高": "Views: low to high",
    "日期：新 → 旧": "Date: newest first",
    "日期：旧 → 新": "Date: oldest first",
    "点赞数：高 → 低": "Likes: high to low",
    "排除回复帖": "Exclude replies",
    "排除引用帖": "Exclude quotes",
    "允许重复回复": "Allow repeat replies",
    "正文必须含关键词": "Require keywords in post text",
    "当前页面": "Current page",
    "快速处理已经打开并加载的帖子": "Quickly process posts already loaded on this page",
    "扫描当前页面": "Scan current page",
    "打开组合搜索": "Open combined search",
    "自动滚动采集": "Auto-scroll collection",
    "按有效结果计数，翻到底后自动结束": "Counts valid results and stops at the end",
    "最多采集条数": "Maximum posts to collect",
    "采集作者账号": "Collect author posts",
    "采集关键词结果": "Collect keyword results",
    "循环采集并评论": "Collect and reply in a loop",
    "多轮自动执行，达到总上限后结束": "Runs multiple rounds and stops at the total limit",
    "采集模式": "Collection mode",
    "关键词搜索": "Keyword search",
    "指定账号": "Selected accounts",
    "总发送上限": "Total send limit",
    "最高 10000": "Maximum 10,000",
    "每轮采集上限": "Per-round collection limit",
    "轮次间隔（分钟）": "Round interval (minutes)",
    "连续空轮上限": "Consecutive empty-round limit",
    "开始循环": "Start loop",
    "暂停 / 继续": "Pause / Resume",
    "定向目标帖子": "Direct target posts",
    "每行一个帖子链接，可填写多条": "One post URL per line; multiple entries allowed",
    "每个帖子重复评论": "Replies per post",
    "载入目标帖子": "Load target posts",
    "评论配置方案": "Reply profile",
    "方案名称": "Profile name",
    "保存/覆盖方案": "Save / overwrite profile",
    "加载方案": "Load profile",
    "删除所选方案": "Delete selected profile",
    "API 设置": "API settings",
    "API Key": "API Key",
    "结束发帖": "End posting",
    "指定回复内容": "Fixed reply content",
    "0 条": "0 items",
    "＋ 在顶部添加新内容": "+ Add content at top",
    "粘贴编号内容": "Paste numbered content",
    "指定发帖内容": "Fixed post content",
    "每个编号到下一个编号之间视为一条帖子；导入将追加到现有内容并自动忽略重复项。": "Each numbered section becomes one post. Import appends to existing content and ignores duplicates.",
    "启用有限循环发帖": "Enable limited post loop",
    "整批没有成功发布时计数": "Counts when an entire batch has no successful posts",
    "“自动发帖数量”作为每批数量；达到总上限后结束，必须手动重新启动。": "Automatic post count is the batch size. At the total limit, start a new run manually.",
    "例如 https://x.com/i/communities/123…": "For example: https://x.com/i/communities/123...",
    "描述主题、语气和必须包含的内容": "Describe the topic, tone, and required content",
    "结束发帖": "End posting",
    "图片库最多保存 20 张": "The image library can store up to 20 images",
    "发帖图片库最多保存 20 张": "The post image library can store up to 20 images",
    "尚未添加图片": "No images added yet",
    "尚未添加发帖图片": "No post images added yet",
    "图片": "Image",
    "图片添加失败": "Image attachment failed",
    "本条使用纯文字": "this item will use text only",
    "填写第": "Enter fixed",
    "条固定回复": "reply",
    "条固定帖子": "post",
    "回复": "Reply",
    "帖子": "Post",
    "个指定帖子": "selected posts",
    "每帖": "per post",
    "API 地址": "API base URL",
    "模型": "Model",
    "评论内容来源": "Reply content source",
    "回复内容来源": "Reply content source",
    "X 普通帖子最多 280": "X posts allow up to 280 characters",
    "AI 生成": "AI generated",
    "指定固定内容": "Fixed content",
    "固定评论内容": "Fixed reply content",
    "按顺序轮换或每次随机选择": "Rotate in order or choose randomly each time",
    "＋ 在顶部添加新内容": "+ Add content at top",
    "批量导入": "Bulk import",
    "回复选择方式": "Reply selection",
    "顺序轮换": "Sequential",
    "随机选择": "Random",
    "定向回复设置": "Directed reply settings",
    "提示词": "Prompt",
    "单条回复字符上限": "Reply character limit",
    "X 普通回复最多 280": "X replies allow up to 280 characters",
    "生成建议数量": "Suggestions to generate",
    "自动回复数量": "Automatic reply count",
    "自动发送间隔模式": "Send delay mode",
    "固定时间": "Fixed delay",
    "随机时间区间": "Random delay range",
    "固定间隔（秒）": "Fixed interval (seconds)",
    "最低 1 秒": "Minimum 1 second",
    "随机最小秒数": "Random minimum seconds",
    "随机最大秒数": "Random maximum seconds",
    "随机评论图片": "Random reply images",
    "可一次选择多张，保存在扩展本地": "Select multiple images; saved locally in the extension",
    "使用图片概率（%）": "Image use probability (%)",
    "设为 0 则始终不带图": "Set to 0 to never attach images",
    "每次发送图片数量": "Images per send",
    "X 最多支持 4 张": "X supports up to 4 images",
    "图片选择方式": "Image selection",
    "随机选取": "Random",
    "全部发送": "Send all",
    "账号运行保护": "Account safeguards",
    "仅在指定时段运行": "Run only during selected hours",
    "开始时间": "Start time",
    "结束时间": "End time",
    "评论每小时上限": "Reply hourly limit",
    "评论每日上限": "Reply daily limit",
    "连续失败熔断次数": "Consecutive-failure cutoff",
    "每个浏览器环境独立计数。达到上限会等待下一个小时或次日，不会丢失任务。": "Usage is counted per browser environment. At a limit, the task waits for the next window without being lost.",
    "保存设置": "Save settings",
    "自动发帖": "Auto post",
    "独立于自动评论，内容、图片和进度互不混用": "Separate from auto replies: content, images, and progress never mix",
    "发帖配置方案": "Post profile",
    "发布位置": "Post destination",
    "公开时间线": "Public timeline",
    "指定 X 社区": "Specific X community",
    "社区链接或 ID": "Community link or ID",
    "发帖内容来源": "Post content source",
    "固定发帖内容": "Fixed post content",
    "每条内容单独填写，可按顺序或随机发送": "Enter each post separately; send sequentially or randomly",
    "＋ 在顶部添加新帖子": "+ Add post at top",
    "粘贴编号内容后批量导入": "Bulk import numbered content",
    "AI 发帖提示词": "AI post prompt",
    "单条帖子字符上限": "Post character limit",
    "自动发帖数量": "Automatic post count",
    "循环发帖": "Loop posts",
    "循环总发送上限": "Loop total send limit",
    "批次间隔（分钟）": "Batch interval (minutes)",
    "连续空批次上限": "Consecutive empty-batch limit",
    "随机发帖图片": "Random post images",
    "发帖运行保护": "Post safeguards",
    "发帖每小时上限": "Post hourly limit",
    "发帖每日上限": "Post daily limit",
    "活跃时段与连续失败熔断沿用“评论设置”中的账号运行保护。": "Active hours and the failure cutoff use the account safeguards in Reply settings.",
    "保存发帖设置": "Save post settings",
    "开始自动发帖": "Start auto post",
    "社区发帖会先进入目标社区并校验社区路径；无法确认发布位置时会暂停，避免误发到公开时间线。": "Community posting enters and verifies the target community first. The task pauses if the destination cannot be confirmed, preventing accidental public posting.",
    "没有符合条件的帖子。尝试降低点赞门槛、清空作者，或先滚动加载更多内容。": "No posts match. Try lowering the like threshold, clearing authors, or loading more posts first.",
    "开始": "Start",
    "停止": "Stop",
    "原帖": "Original post",
    "生成回复": "Generate replies",
    "已回复": "Replied",
    "返回": "Back",
    "正在生成回复…": "Generating replies...",
    "正在载入指定内容…": "Loading fixed content...",
    "生成回复失败": "Reply generation failed",
    "API 没有成功返回，请检查设置后重试。": "The API did not return successfully. Check settings and try again.",
    "回复建议": "Reply suggestions",
    "指定内容": "Fixed content",
    "填入": "Fill",
    "删除": "Delete",
    "取消": "Cancel",
    "导入": "Import",
    "未选择任何文件": "No file selected",
    "选择文件": "Choose files",
    "当前没有正在运行的自动回复任务": "No auto-reply task is running",
    "当前没有自动发帖任务": "No auto-post task is running",
    "任务已暂停": "Task paused",
    "任务已继续": "Task resumed",
    "正在停止…": "Stopping...",
    "扩展刚刚被重新加载，请刷新当前 X 页面后继续": "The extension was reloaded. Refresh this X page to continue.",
    "选择已保存方案": "Select a saved profile",
    "历史任务状态已恢复": "Previous task status was recovered",
    "语言切换为英文": "Language switched to English",
    "语言已切换为中文": "Language switched to Chinese",
    "达到总上限后自动结束；再次运行需重新点击开始。": "Stops automatically at the total limit. Start a new run manually.",
    "指定帖子链接": "Post URLs",
    "直接载入一个或多个帖子": "Load one or more posts directly",
    "帖子链接": "Post URLs",
    "每行一条": "One URL per line",
    "每个帖子评论次数": "Replies per post",
    "同一帖子连续发送多条不同评论": "Send multiple different replies to the same post",
    "载入指定帖子": "Load target posts",
    "支持 1.、2.、3. 格式": "Supports 1., 2., 3. format",
    "每个编号到下一个编号之间视为一条回复；导入将追加到现有内容并自动忽略重复项。": "Each numbered section becomes one reply. Import appends to existing content and ignores duplicates.",
    "追加导入": "Append import",
    "使用方式": "Selection mode",
    "按顺序轮换": "Sequential",
    "每次随机选择": "Random each time",
    "回复模式": "Reply mode",
    "定向回复（由我的提示词主导）": "Directed reply (guided by my prompt)",
    "原帖回复（围绕帖子内容）": "Contextual reply (based on the post)",
    "定向回复提示词": "Directed reply prompt",
    "定向模式必填": "Required for directed mode",
    "定向模式下，你的提示词决定回复方向，原帖只用于自然衔接。密钥和提示词保存在浏览器扩展本地存储中。": "In directed mode, your prompt determines the reply direction; the original post is only context. Keys and prompts are stored locally in the extension.",
    "支持 1.、2.、3. 格式": "Supports 1., 2., 3. format",
    "每个编号到下一个编号之间视为一条帖子；导入将追加到现有内容并自动忽略重复项。": "Each numbered section becomes one post. Import appends to existing content and ignores duplicates.",
    "循环发帖（有总上限）": "Loop posts (with total limit)",
    "启用有限循环发帖": "Enable limited post loop",
    "整批没有成功发布时计数": "Counts when an entire batch has no successful posts",
    "“自动发帖数量”作为每批数量；达到总上限后结束，必须手动重新启动。": "Automatic post count is the batch size. At the total limit, start a new run manually.",
    "发帖间隔模式": "Post delay mode",
    "发帖专用图片库，不与评论图片混用": "Dedicated post image library; never shared with reply images",
    "随机结果也可以不选图片": "Random selection may also choose no image",
    "停止": "Stop",
    "批量自动回复": "Bulk auto reply",
    "计划发送": "Planned sends",
    "条": "items",
    "正在停止…": "Stopping...",
    "运行中": "Running",
    "已发送": "Sent",
    "已跳过": "Skipped",
    "第": "Round",
    "轮": "round",
    "阶段": "phase",
    "准备": "ready",
    "自动采集账号帖子": "Auto-collect author posts",
    "自动采集关键词搜索结果（忽略作者栏）": "Auto-collect keyword search results (ignore author field)",
    "浏览量从高到低": "Views: high to low",
    "浏览量从低到高": "Views: low to high",
    "日期从新到旧": "Date: newest first",
    "日期从旧到新": "Date: oldest first",
    "点赞数从高到低": "Likes: high to low",
    "当前可发送": "Available now",
    "按": "sorted by",
    "处理": "process",
    "目标": "Target",
    "候选": "Candidate",
    "帖子加载超时，正在重试": "Post load timed out; retrying",
    "图片已载入，正在恢复回复文字…": "Image loaded; restoring reply text...",
    "评论已达每小时上限": "Reply hourly limit reached",
    "评论已达每日上限": "Reply daily limit reached",
    "发帖已达每小时上限": "Post hourly limit reached",
    "发帖已达每日上限": "Post daily limit reached",
    "当前不在活跃时段": "Outside active hours",
    "后继续": "until continue",
    "自动恢复": "resumes automatically",
    "另有": "plus",
    "项运行保护": "other safeguards",
    "方案与 API": "Profile & API",
    "回复内容": "Reply content",
    "发送设置": "Send settings",
    "运行保护": "Safeguards",
    "启用运行保护": "Enable safeguards",
    "快速操作": "Quick actions",
    "采集与循环": "Collect & Loop",
    "方案与目标": "Profile & destination",
    "发帖内容": "Post content",
    "循环发帖": "Post loop",
    "默认关闭；开启后限制发送频率与时段": "Off by default; when enabled, rate-limits and active-hour rules apply",
    "评论与发帖的活跃时段和熔断共享上面设置。": "Active hours and failure cutoff apply to both replies and posts.",
    "每个浏览器环境独立计数。评论与发帖的活跃时段和熔断共享上面设置。": "Usage is per browser profile. Active hours and failure cutoff apply to both replies and posts.",
    "发送后给自己的回复点赞": "Like own reply after sending",
    "发送后给自己的帖子点赞": "Like own post after sending"
  };

  const RULES = [
    [/^评论已达每小时上限（(.+)\/(.+)）$/, "Reply hourly limit reached ($1/$2)"],
    [/^评论已达每日上限（(.+)\/(.+)）$/, "Reply daily limit reached ($1/$2)"],
    [/^发帖已达每小时上限（(.+)\/(.+)）$/, "Post hourly limit reached ($1/$2)"],
    [/^发帖已达每日上限（(.+)\/(.+)）$/, "Post daily limit reached ($1/$2)"],
    [/^当前不在活跃时段（(.+)）$/, "Outside active hours ($1)"],
    [/^(.+) 后继续 · (.+) 自动恢复(?: · 另有 (\d+) 项运行保护)?$/, "$1 until resume · resumes automatically $2$3"],
    [/^目标 (\d+) 条 · 已发送 (\d+) · 已跳过 (\d+)$/, "Target $1 · Sent $2 · Skipped $3"],
    [/^自动发帖 · 已发布 (\d+)\/(\d+) · 已跳过 (\d+)$/, "Auto post · Published $1/$2 · Skipped $3"],
    [/^已发送 (\d+)\/(\d+)，等待 (\d+) 秒；同时预生成下一条…$/, "Sent $1/$2; waiting $3 seconds while preparing the next reply..."],
    [/^已发布 (\d+)\/(\d+)，等待 (\d+) 秒后发布下一条$/, "Published $1/$2; next post in $3 seconds"],
    [/^任务已暂停 · 已发送 (\d+) · 已跳过 (\d+)$/, "Task paused · Sent $1 · Skipped $2"],
    [/^发帖任务已暂停 · 已发布 (\d+)\/(\d+)$/, "Post task paused · Published $1/$2"],
    [/^正在确认第 (\d+)\/(\d+) 条是否发送成功…$/, "Confirming whether reply $1/$2 was sent..."],
    [/^正在确认第 (\d+)\/(\d+) 条帖子…$/, "Confirming post $1/$2..."],
    [/^正在重试 (\d+)\/(\d+)…$/, "Retrying $1/$2..."],
    [/^等待 (\d+) 秒后继续$/, "Waiting $1 seconds before continuing"],
    [/^今天 (\d\d:\d\d)$/, "Today $1"],
    [/^明天 (\d\d:\d\d)$/, "Tomorrow $1"],
    [/^(\d+) 秒$/, "$1 seconds"],
    [/^(\d+) 分钟$/, "$1 minutes"],
    [/^(\d+) 分 (\d+) 秒$/, "$1 min $2 sec"],
    [/^(\d+) 小时$/, "$1 hours"],
    [/^(\d+) 小时 (\d+) 分$/, "$1 hr $2 min"],
    [/^(\d+) 条$/, "$1 items"]
  ];

  function normalizeLocale(value) { return LOCALES.includes(value) ? value : "zh-CN"; }
  function format(locale, value) {
    if (value == null) return "";
    if (typeof value === "number") return new Intl.NumberFormat(locale === "zh-CN" ? "zh-CN" : "en-US").format(value);
    return String(value);
  }
  function translateExact(text, locale) {
    if (locale === "zh-CN") return text;
    return TEXT[text] || text;
  }
  function translateRules(text, locale) {
    if (locale === "zh-CN") return text;
    for (const [pattern, replacement] of RULES) {
      if (pattern.test(text)) return text.replace(pattern, replacement);
    }
    return text;
  }
  function reverseExact(text) {
    for (const [zh, en] of Object.entries(TEXT)) if (en === text) return zh;
    return text;
  }
  function reverseRules(text) {
    const pairs = [
      [/^Reply hourly limit reached \((.+)\/(.+)\)$/, "评论已达每小时上限（$1/$2）"],
      [/^Reply daily limit reached \((.+)\/(.+)\)$/, "评论已达每日上限（$1/$2）"],
      [/^Post hourly limit reached \((.+)\/(.+)\)$/, "发帖已达每小时上限（$1/$2）"],
      [/^Post daily limit reached \((.+)\/(.+)\)$/, "发帖已达每日上限（$1/$2）"],
      [/^Outside active hours \((.+)\)$/, "当前不在活跃时段（$1）"],
      [/^(\d+) seconds$/, "$1 秒"],
      [/^(\d+) minutes$/, "$1 分钟"],
      [/^(\d+) min (\d+) sec$/, "$1 分 $2 秒"],
      [/^(\d+) hours$/, "$1 小时"],
      [/^(\d+) hr (\d+) min$/, "$1 小时 $2 分"]
    ];
    for (const [pattern, replacement] of pairs) if (pattern.test(text)) return text.replace(pattern, replacement);
    return text;
  }
  function text(value, locale) {
    const source = String(value ?? "");
    if (locale === "zh-CN") return reverseRules(reverseExact(source));
    let translated = translateExact(source, locale);
    if (translated !== source) return translated;
    translated = translateRules(source, locale);
    if (translated !== source) return translated;
    translated = source.replace(/评论已达每小时上限/g, TEXT["评论已达每小时上限"])
      .replace(/评论已达每日上限/g, TEXT["评论已达每日上限"])
      .replace(/发帖已达每小时上限/g, TEXT["发帖已达每小时上限"])
      .replace(/当前不在活跃时段/g, TEXT["当前不在活跃时段"])
      .replace(/后继续/g, TEXT["后继续"])
      .replace(/自动恢复/g, TEXT["自动恢复"])
      .replace(/另有/g, TEXT["另有"])
      .replace(/项运行保护/g, TEXT["项运行保护"]);
    return translated;
  }
  function hasHan(value) { return /[\u3400-\u9fff]/.test(value); }
  function errorMessage(error, locale = "zh-CN") {
    const value = typeof error === "string" ? error : error?.message || error;
    let parsed = value;
    try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { parsed = null; }
    if (!parsed?.code) return locale === "zh-CN" ? String(value || "未知错误") : "Unknown error";
    const labels = {
      missingApiKey: ["请先在设置中填写 API Key", "Enter an API key in settings first"],
      missingPostPrompt: ["请先填写 AI 发帖提示词", "Enter an AI post prompt first"],
      timeout: ["API 请求超过 45 秒", "The API request exceeded 45 seconds"],
      network: ["无法连接 API", "Unable to connect to the API"],
      emptyResponse: ["AI 没有返回内容", "The AI returned no content"],
      invalidJson: ["AI 返回的不是有效 JSON", "The AI did not return valid JSON"],
      outputLength: ["模型输出额度被耗尽，未生成正文", "The model ran out of output budget before generating content"],
      providerError: ["AI 请求失败", "AI request failed"]
    };
    const label = labels[parsed.code]?.[locale === "zh-CN" ? 0 : 1] || (locale === "zh-CN" ? "发生错误" : "An error occurred");
    return parsed.detail ? `${label}: ${parsed.detail}` : label;
  }
  function localizeElement(root, locale) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = text(element.dataset.i18n, locale);
    });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = text(element.dataset.i18nTitle, locale); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = text(element.dataset.i18nPlaceholder, locale); });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => { element.setAttribute("aria-label", text(element.dataset.i18nAriaLabel, locale)); });
  }
  function captureStaticNodes(root) {
    const excluded = new Set(["xrc-list", "xrc-detail", "xrc-image-list", "xrc-post-image-list", "xrc-jobbar", "xrc-post-jobbar", "xrc-toast"]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const owner = parent.closest("[id]")?.id || "";
      if (!parent || !node.nodeValue.trim() || parent.closest("textarea, input, script, style") || parent.closest("[data-i18n]") || excluded.has(owner)) continue;
      nodes.push({ node, source: node.nodeValue });
    }
    return nodes;
  }
  function localizeStaticNodes(nodes, locale) {
    for (const item of nodes || []) {
      if (!item.node.isConnected) continue;
      const source = item.source;
      const trimmed = source.trim();
      const translated = text(trimmed, locale);
      item.node.nodeValue = source.replace(trimmed, translated);
    }
  }
  function message(key, params = {}, locale = "zh-CN") {
    const template = text(key, locale);
    return template.replace(/\{(\w+)\}/g, (_, name) => format(locale, params[name]));
  }
  window.XRC_I18N = { LOCALES, TEXT, normalizeLocale, text, message, errorMessage, localizeElement, captureStaticNodes, localizeStaticNodes, hasHan };
})();
