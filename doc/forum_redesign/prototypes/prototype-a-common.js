/* ============================================================
   Academy · Prototype A 共享脚本
   i18n（zh/en）+ 主题切换 + 通用工具（toast/modal/导航）
   ============================================================ */

/* ---------- 全量文案 ---------- */
const I18N = {
  zh: {
    // 品牌与导航
    brand:"Academy", home:"首页", create:"发帖", match:"学术匹配", chat:"聊天",
    messages:"信件箱", profile:"我的", settings:"LLM 设置", friends:"好友请求", searchPh:"搜索帖子、用户或标签…",
    // 认证
    login:"登录", register:"注册", logout:"退出", welcomeBack:"欢迎回来", createAccount:"创建账号",
    loginSub:"登录以继续学术交流", regSub:"加入 Academy，与同好一起成长",
    username:"用户名", password:"密码", confirmPwd:"确认密码", usernamePh:"请输入用户名",
    passwordPh:"请输入密码", noAccount:"还没有账号？", hasAccount:"已有账号？", registerNow:"立即注册", loginNow:"立即登录",
    pwdMismatch:"两次输入的密码不一致", fieldRequired:"用户名和密码不能为空",
    // 首页
    latestPosts:"最新帖子", liveFeed:"实时更新", welcome:"欢迎回到 Academy",
    heroSub:"一个专注于学术讨论与资源分享的社区", online:"人在线",
    // 帖子
    newPost:"发布帖子", titlePh:"帖子标题", contentPh:"写点什么… 支持 Markdown",
    publish:"发布", preview:"预览", write:"编辑", editorTip:"支持 **加粗**、`代码`、图片与视频",
    comments:"评论", commentPh:"写下你的评论…（@用户名 可提及他人）", submitComment:"发表评论",
    noComments:"还没有评论，来抢沙发～", readMore:"阅读全文", like:"赞", views:"阅读",
    deletePost:"删除帖子", confirmDelPost:"确定要删除这篇帖子吗？评论将一并删除且无法恢复。",
    confirm:"确定", cancel:"取消", delete:"删除",
    postDetail:"帖子详情", author:"作者", created:"发布于",
    // 搜索
    searchResult:"搜索结果", forKey:"关于", users:"用户", posts:"帖子", noResult:"未找到相关内容", tryOther:"换个关键词试试",
    // 资料
    editProfile:"编辑资料", profileOf:"的资料", postCount:"帖子", follower:"关注", following:"粉丝",
    learningInterest:"学习意向", bio:"签名", notSet:"未设置", followBtn:"关注", followingBtn:"已关注",
    editBtn:"编辑资料", about:"关于", recentPosts:"最近的帖子", noPosts:"还没有发布过帖子",
    // 编辑资料
    avatarLabel:"头像（图片 URL）", bioLabel:"个人签名", interestLabel:"学习意向", saveProfile:"保存修改",
    avatarPh:"粘贴头像图片地址", bioPh:"一句话介绍自己", interestPh:"如：深度学习、NLP、前端工程",
    // 学术匹配
    matchTitle:"学术资源匹配", matchSub:"基于智慧芽 MCP 检索专利与文献，并可调用大模型分析匹配度",
    keywordPh:"输入检索关键词，如：Transformer", useInterest:"使用我的学习意向增强检索",
    useLLM:"使用大模型生成匹配度分析", runSearch:"开始检索", searching:"检索中…",
    llmReady:"LLM 已配置", llmNotReady:"未配置 LLM（可跳过分析）", mcpReady:"MCP 服务正常",
    mcpNotReady:"MCP 未配置", interestPrefill:"学习意向已预填",
    // 匹配结果
    matchResult:"匹配结果", patents:"专利", literature:"文献", summary:"匹配度分析",
    tools:"涉及的专利工具", noResultMatch:"未检索到相关资源", backToMatch:"返回检索",
    source:"来源", date:"日期", applicant:"申请人", expand:"展开全文", collapse:"收起",
    // 匹配历史
    matchHistory:"检索历史", keyword:"关键词", resultCount:"结果数", time:"时间", view:"查看", emptyHistory:"暂无检索记录",
    // LLM 设置
    llmTitle:"大模型 API 配置", llmSub:"OpenAI 兼容格式，用于学术匹配分析",
    baseUrl:"Base URL", apiKey:"API Key", model:"模型名称", baseUrlPh:"如 https://api.openai.com/v1",
    modelPh:"如 gpt-4o-mini", saveCfg:"保存配置", testConn:"测试连接", testing:"测试中…",
    cfgSaved:"配置已保存", cfgEmpty:"三项均不能为空", testSuccess:"连接成功", testFail:"连接失败",
    keyMasked:"已配置（已脱敏）", notConfigured:"未配置",
    // 聊天
    chatTitle:"聊天", friends:"好友", recent:"最近对话", typeMsg:"输入消息…", send:"发送",
    noFriend:"还没有好友，去添加吧", emptyChat:"暂无消息，打个招呼吧", onlyFriend:"仅好友之间可以聊天",
    // 信件箱
    msgTitle:"信件箱", systemNotice:"系统通知", markRead:"打开即自动已读", emptyMsgs:"暂无通知",
    mention:"在帖子中@了你", friendReq:"请求添加你为好友", acceptNotice:"已接受你的好友请求",
    // 好友请求
    friendsTitle:"好友请求", received:"我收到的", sent:"我发出的", accept:"接受", reject:"拒绝",
    emptyReceived:"暂无收到的好友请求", emptySent:"暂无发出的请求", pending:"待处理",
    // 通用
    on:"在线", off:"离线", search:"搜索", back:"返回", viewAll:"查看全部",
    skeletonLoading:"加载中", retry:"重试", loadFailed:"加载失败",
    notImplemented:"原型演示（静态页面）", saved:"已保存", copied:"已复制",
  },
  en: {
    // Brand & nav
    brand:"Academy", home:"Home", create:"New Post", match:"Research", chat:"Chat",
    messages:"Inbox", profile:"Me", settings:"LLM Settings", friends:"Friend Requests", searchPh:"Search posts, users or tags…",
    // Auth
    login:"Sign in", register:"Sign up", logout:"Sign out", welcomeBack:"Welcome back", createAccount:"Create account",
    loginSub:"Sign in to continue", regSub:"Join Academy and grow with peers",
    username:"Username", password:"Password", confirmPwd:"Confirm password", usernamePh:"Enter username",
    passwordPh:"Enter password", noAccount:"No account yet?", hasAccount:"Already have an account?", registerNow:"Sign up", loginNow:"Sign in",
    pwdMismatch:"Passwords do not match", fieldRequired:"Username and password are required",
    // Home
    latestPosts:"Latest Posts", liveFeed:"Live feed", welcome:"Welcome back to Academy",
    heroSub:"A community for academic discussion and sharing", online:"online",
    // Posts
    newPost:"New Post", titlePh:"Post title", contentPh:"Write something… Markdown supported",
    publish:"Publish", preview:"Preview", write:"Write", editorTip:"Supports **bold**, `code`, images and videos",
    comments:"comments", commentPh:"Write a comment… (@username to mention)", submitComment:"Comment",
    noComments:"No comments yet. Be the first!", readMore:"Read more", like:"likes", views:"views",
    deletePost:"Delete post", confirmDelPost:"Delete this post? All comments will be removed permanently.",
    confirm:"Confirm", cancel:"Cancel", delete:"Delete",
    postDetail:"Post detail", author:"Author", created:"Created",
    // Search
    searchResult:"Search results", forKey:"for", users:"Users", posts:"Posts", noResult:"Nothing found", tryOther:"Try another keyword",
    // Profile
    editProfile:"Edit profile", profileOf:"'s profile", postCount:"Posts", follower:"Followers", following:"Following",
    learningInterest:"Learning interest", bio:"Bio", notSet:"Not set", followBtn:"Follow", followingBtn:"Following",
    editBtn:"Edit profile", about:"About", recentPosts:"Recent posts", noPosts:"No posts yet",
    // Edit profile
    avatarLabel:"Avatar (image URL)", bioLabel:"Bio", interestLabel:"Learning interest", saveProfile:"Save changes",
    avatarPh:"Paste avatar image URL", bioPh:"One sentence about you", interestPh:"e.g. Deep Learning, NLP, Frontend",
    // Match
    matchTitle:"Academic Matching", matchSub:"Search patents & literature via PatSnap MCP, optionally analyze relevance with LLM",
    keywordPh:"Enter keyword, e.g. Transformer", useInterest:"Enhance with my learning interest",
    useLLM:"Analyze relevance with LLM", runSearch:"Search", searching:"Searching…",
    llmReady:"LLM configured", llmNotReady:"LLM not configured (analysis can be skipped)", mcpReady:"MCP service OK",
    mcpNotReady:"MCP not configured", interestPrefill:"Learning interest prefilled",
    // Match result
    matchResult:"Match Results", patents:"Patents", literature:"Literature", summary:"Relevance analysis",
    tools:"Patent tools involved", noResultMatch:"No resources found", backToMatch:"Back to search",
    source:"Source", date:"Date", applicant:"Applicant", expand:"Expand", collapse:"Collapse",
    // Match history
    matchHistory:"Search History", keyword:"Keyword", resultCount:"Results", time:"Time", view:"View", emptyHistory:"No records yet",
    // LLM settings
    llmTitle:"LLM API Configuration", llmSub:"OpenAI-compatible, used for match analysis",
    baseUrl:"Base URL", apiKey:"API Key", model:"Model", baseUrlPh:"e.g. https://api.openai.com/v1",
    modelPh:"e.g. gpt-4o-mini", saveCfg:"Save", testConn:"Test", testing:"Testing…",
    cfgSaved:"Configuration saved", cfgEmpty:"All three fields are required", testSuccess:"Connected", testFail:"Connection failed",
    keyMasked:"Configured (masked)", notConfigured:"Not configured",
    // Chat
    chatTitle:"Chat", friends:"Friends", recent:"Recent", typeMsg:"Type a message…", send:"Send",
    noFriend:"No friends yet. Go add some!", emptyChat:"No messages yet. Say hi!", onlyFriend:"Only friends can chat",
    // Messages
    msgTitle:"Inbox", systemNotice:"System notices", markRead:"Auto marked as read", emptyMsgs:"No notices",
    mention:"mentioned you in a post", friendReq:"sent you a friend request", acceptNotice:"accepted your friend request",
    // Friend requests
    friendsTitle:"Friend Requests", received:"Received", sent:"Sent", accept:"Accept", reject:"Reject",
    emptyReceived:"No incoming requests", emptySent:"No outgoing requests", pending:"Pending",
    // Common
    on:"Online", off:"Offline", search:"Search", back:"Back", viewAll:"View all",
    skeletonLoading:"Loading", retry:"Retry", loadFailed:"Failed to load",
    notImplemented:"Prototype demo (static)", saved:"Saved", copied:"Copied",
  }
};

/* ---------- 状态 ---------- */
let LANG = localStorage.getItem('acad-lang') || 'zh';
let THEME = localStorage.getItem('acad-theme') || 'dark';

const t = key => (I18N[LANG] && I18N[LANG][key]) || key;
const lang = () => LANG;

/* ---------- 语言 / 主题 ---------- */
function applyLang(l){
  LANG = l; localStorage.setItem('acad-lang', l);
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = I18N[LANG][el.dataset.i18n];
    if (v !== undefined) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const v = I18N[LANG][el.dataset.i18nPh];
    if (v !== undefined) el.placeholder = v;
  });
  document.dispatchEvent(new Event('langchange'));
  syncNavLabels();
}
function applyTheme(th){
  THEME = th; localStorage.setItem('acad-theme', th);
  document.documentElement.dataset.theme = th;
  const lbl = document.getElementById('themeLabel');
  if (lbl) lbl.textContent = th === 'dark' ? (LANG === 'zh' ? '浅色' : 'Light') : (LANG === 'zh' ? '深色' : 'Dark');
  document.dispatchEvent(new Event('themechange'));
}
function toggleLang(){ applyLang(LANG === 'zh' ? 'en' : 'zh'); }
function toggleTheme(){ applyTheme(THEME === 'dark' ? 'light' : 'dark'); }

/* ---------- 导航 ---------- */
function renderNav(activeKey){
  const items = [
    ['home','prototype-a.html', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    ['create','prototype-a-create.html', 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    ['match','prototype-a-match.html', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z'],
    ['chat','prototype-a-chat.html', 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.4-.7L3 21l1.8-5.6A8.4 8.4 0 1 1 21 11.5z'],
    ['messages','prototype-a-messages.html', 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'],
    ['profile','prototype-a-profile.html', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  ];
  const nav = document.getElementById('nav');
  if (nav){
    nav.innerHTML = items.map(([key, href, ic]) => `
      <a href="${href}" class="${key === activeKey ? 'active' : ''}">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${ic}"/></svg>
        <span>${t(key)}</span>${key === 'messages' ? '<span class="badge">3</span>' : ''}
      </a>`).join('');
  }
  const brand = document.querySelector('.brand .name');
  if (brand) brand.textContent = t('brand');
  const bottom = document.getElementById('sideBottom');
  if (bottom){
    bottom.innerHTML = `
      <div class="ctrl">
        <button id="btnLang" title="Language">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
          <span id="langLabel"></span>
        </button>
        <button id="btnTheme" title="Theme">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
          <span id="themeLabel"></span>
        </button>
      </div>
      <div class="user-chip" style="margin-top:8px">
        <span class="avatar">星</span>
        <div style="min-width:0"><div class="u-name">星野原</div><div class="u-sub">${t('on')}</div></div>
      </div>`;
    document.getElementById('btnLang').onclick = toggleLang;
    document.getElementById('btnTheme').onclick = toggleTheme;
  }
  syncNavLabels();
}
function syncNavLabels(){
  const lbl = document.getElementById('langLabel');
  if (lbl) lbl.textContent = LANG === 'zh' ? 'EN' : '中';
  const tLbl = document.getElementById('themeLabel');
  if (tLbl) tLbl.textContent = THEME === 'dark' ? (LANG === 'zh' ? '浅色' : 'Light') : (LANG === 'zh' ? '深色' : 'Dark');
}

/* ---------- Toast ---------- */
function toast(type, msg){
  let box = document.querySelector('.toasts');
  if (!box){ box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="tc">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${msg}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2600);
}

/* ---------- Modal ---------- */
function modal(title, text, onOk, okText){
  const mask = document.createElement('div');
  mask.className = 'modal-mask show';
  mask.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <p>${text}</p>
      <div class="row">
        <button class="btn btn-ghost" id="mCancel">${t('cancel')}</button>
        <button class="btn btn-danger" id="mOk">${okText || t('confirm')}</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('#mCancel').onclick = () => mask.remove();
  mask.querySelector('#mOk').onclick = () => { mask.remove(); onOk && onOk(); };
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

/* ---------- 工具 ---------- */
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function avatarChar(name){ return esc((name || '?').charAt(0)); }
function skeleton(count){
  return Array.from({length: count}, () => `
    <div class="skel-card">
      <div class="skeleton" style="width:36%;height:18px;margin-bottom:12px"></div>
      <div class="skeleton" style="width:100%;height:14px;margin-bottom:8px"></div>
      <div class="skeleton" style="width:82%;height:14px;margin-bottom:16px"></div>
      <div class="skeleton" style="width:30%;height:12px"></div>
    </div>`).join('');
}
function icon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="${path}"/></svg>`; }

/* ---------- 自动初始化：应用持久化的语言与主题 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(THEME);
  applyLang(LANG);
});
