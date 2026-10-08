/* Static reading experience; no framework, build step, analytics, or remote runtime. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Reading works without storage. */ } }
  };
  const chapters = $$('.chapter');
  const chapterLinks = $$('.toc a');
  const main = $('main');
  const sidebar = $('#sidebar');
  const menuButton = $('#menuBtn');
  const scrim = $('#menuScrim');
  const desktop = matchMedia('(min-width: 70rem)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = $('#searchDialog');
  const search = $('#searchInput');
  const results = $('#searchResults');
  const feedback = $('#searchFeedback');
  const themeMedia = matchMedia('(prefers-color-scheme: dark)');
  let menuOpen = false;
  let searchOpener;

  function announce(message) { $('#liveStatus').textContent = message; }

  function setMenu(open, restoreFocus = true) {
    menuOpen = open && !desktop.matches;
    sidebar.classList.toggle('open', menuOpen);
    scrim.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    main.inert = menuOpen;
    sidebar.inert = !desktop.matches && !menuOpen;
    document.body.style.overflowY = menuOpen ? 'hidden' : '';
    if (menuOpen) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      $('.search-launch', sidebar).focus({ preventScroll: true });
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (restoreFocus && !desktop.matches) menuButton.focus({ preventScroll: true });
    }
  }
  menuButton.addEventListener('click', () => setMenu(!menuOpen));
  $('#closeMenu').addEventListener('click', () => setMenu(false));
  scrim.addEventListener('click', () => setMenu(false));
  desktop.addEventListener('change', () => setMenu(false, false));
  setMenu(false, false);

  sidebar.addEventListener('keydown', event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); }
    if (event.key !== 'Tab') return;
    const focusable = $$('a[href], button:not([disabled])', sidebar).filter(el => el.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  chapterLinks.forEach(link => link.addEventListener('click', () => {
    if (menuOpen) setMenu(false, false);
    const section = $(link.getAttribute('href'));
    section.focus({ preventScroll: true });
  }));

  function setTheme(theme, save = true) {
    document.documentElement.dataset.theme = theme;
    if (save) store.set('netbook-theme', theme);
    const dark = theme === 'dark';
    const button = $('#themeBtn');
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    button.title = dark ? '切换到浅色模式' : '切换到深色模式';
    $('#themeLabel').textContent = dark ? '浅色' : '深色';
  }
  const savedTheme = store.get('netbook-theme');
  setTheme(['light', 'dark'].includes(savedTheme) ? savedTheme : (themeMedia.matches ? 'dark' : 'light'), false);
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  themeMedia.addEventListener('change', event => {
    if (!['light', 'dark'].includes(store.get('netbook-theme'))) setTheme(event.matches ? 'dark' : 'light', false);
  });
  $('#printBtn').addEventListener('click', () => window.print());
  const typeSizes = ['1.0625rem', '1.1875rem', '1.3125rem'];
  let typeSize = Math.max(0, typeSizes.indexOf(store.get('netbook-type-size')));
  function applyTypeSize() {
    document.documentElement.style.setProperty('--text-prose', typeSizes[typeSize]);
    $('#fontBtn').setAttribute('aria-label', `正文字号${['标准', '较大', '大'][typeSize]}，点击切换`);
    $('#fontBtn').title = `正文字号：${['标准', '较大', '大'][typeSize]}`;
  }
  applyTypeSize();
  $('#fontBtn').addEventListener('click', () => {
    typeSize = (typeSize + 1) % typeSizes.length;
    applyTypeSize();
    store.set('netbook-type-size', typeSizes[typeSize]);
    announce(`正文字号已调整为${['标准', '较大', '大'][typeSize]}`);
  });

  // Index original content only, before adding generated controls and navigation.
  const searchIndex = chapters.flatMap(section => {
    let heading = $('h2', section).textContent;
    return $$('h2, h3, h4, p, li, pre, .mini, summary, th, td, .note, .node, .layer, .quiz > b, .quiz .answer', section)
      .filter(el => !el.parentElement.closest('li, pre, .mini, .note, .node, .layer, .answer, td, th'))
      .map((element, index) => {
        if (element.matches('h3')) heading = element.textContent;
        if (!element.id) element.id = `${section.id}-text-${index}`;
        return { element, section, heading, text: element.textContent.replace(/\s+/g, ' ').trim() };
      });
  });
  function addHighlighted(parent, value, query) {
    let start = 0;
    let found;
    const lower = value.toLocaleLowerCase();
    while ((found = lower.indexOf(query, start)) !== -1) {
      parent.append(document.createTextNode(value.slice(start, found)));
      const mark = document.createElement('mark');
      mark.textContent = value.slice(found, found + query.length);
      parent.append(mark);
      start = found + query.length;
    }
    parent.append(document.createTextNode(value.slice(start)));
  }
  let searchTimer;
  function runSearch() {
    const query = search.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) {
      feedback.textContent = '搜索教程正文与命令。输入关键词，按Enter打开首个结果。';
      return;
    }
    const hits = searchIndex.filter(item => item.text.toLocaleLowerCase().includes(query));
    feedback.textContent = hits.length ? `找到${hits.length}处匹配${hits.length > 30 ? '，显示前30处；可补充关键词缩小范围' : ''}。` : `没有找到“${search.value.trim()}”。试试IP、端口或DNS。`;
    if (!hits.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = '可缩短关键词，或使用目录按主题查找。';
      results.append(empty);
    }
    hits.slice(0, 30).forEach(hit => {
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = '#' + hit.element.id;
      const title = document.createElement('strong');
      title.textContent = hit.heading;
      const snippet = document.createElement('span');
      const match = hit.text.toLocaleLowerCase().indexOf(query);
      const start = Math.max(0, match - 24);
      addHighlighted(snippet, `${start ? '…' : ''}${hit.text.slice(start, start + Math.max(110, query.length + 40))}${hit.text.length > start + Math.max(110, query.length + 40) ? '…' : ''}`, query);
      link.append(title, snippet);
      link.addEventListener('click', () => {
        dialog.close('navigate');
        const parentDetails = hit.element.closest('details');
        if (parentDetails) parentDetails.open = true;
        const answer = hit.element.closest('.answer');
        if (answer) answer.hidden = false;
        hit.element.tabIndex = -1;
        requestAnimationFrame(() => {
          hit.element.focus({ preventScroll: true });
          hit.element.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
          hit.element.classList.add('search-target');
          setTimeout(() => hit.element.classList.remove('search-target'), 2500);
        });
      });
      results.append(link);
    });
  }
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 180); });
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter') { clearTimeout(searchTimer); runSearch(); const first = $('a', results); if (first) first.click(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); $('a', results)?.focus(); }
  });
  results.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = $$('a', results);
    const index = links.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = index + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) search.focus();
    else links[Math.min(next, links.length - 1)].focus();
  });
  function openSearch(opener) {
    searchOpener = opener;
    if (menuOpen) { setMenu(false, false); searchOpener = menuButton; }
    dialog.showModal();
    runSearch();
    search.focus();
  }
  $$('[data-open-search]').forEach(button => button.addEventListener('click', () => openSearch(button)));
  $('#closeSearch').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(searchTimer);
    if (dialog.returnValue !== 'navigate') searchOpener?.focus({ preventScroll: true });
    dialog.returnValue = '';
  });
  document.addEventListener('keydown', event => {
    const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !editing)) {
      event.preventDefault();
      if (!dialog.open) openSearch(document.activeElement);
    }
  });

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch { /* Use local-file fallback. */ }
    }
    const previous = document.activeElement;
    const input = document.createElement('textarea');
    input.value = text;
    input.className = 'sr-only';
    input.setAttribute('aria-label', '待复制的命令');
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    previous?.focus({ preventScroll: true });
    if (!copied) throw new Error('Clipboard unavailable');
  }
  $$('pre').forEach((pre, index) => {
    const code = $('code', pre);
    if (!code) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.before(wrapper);
    wrapper.append(pre);
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', '代码或命令示例');
    const button = document.createElement('button');
    button.className = 'copy';
    button.type = 'button';
    button.textContent = '复制';
    button.setAttribute('aria-label', `复制第${index + 1}段代码或命令`);
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        await copyText(code.textContent);
        button.textContent = '已复制';
        button.dataset.state = 'success';
        $('.copy-help', wrapper)?.remove();
      } catch {
        button.textContent = '重试';
        button.dataset.state = 'error';
        if (!$('.copy-help', wrapper)) {
          const help = document.createElement('p');
          help.className = 'copy-help';
          help.setAttribute('role', 'status');
          help.textContent = '浏览器未允许复制。可选中命令后手动复制，或点击重试。';
          wrapper.append(help);
        }
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        setTimeout(() => { if (button.dataset.state === 'success') { button.textContent = '复制'; delete button.dataset.state; } }, 2500);
      }
    });
    wrapper.append(button);
  });

  $$('.quiz').forEach((quiz, index) => {
    const answer = $('.answer', quiz);
    const button = $('button', quiz);
    answer.id = `quiz-answer-${index}`;
    answer.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', answer.id);
    button.addEventListener('click', () => {
      answer.hidden = !answer.hidden;
      button.textContent = answer.hidden ? '看答案' : '收起答案';
      button.setAttribute('aria-expanded', String(!answer.hidden));
    });
  });
  $$('table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', table.caption?.textContent || '数据表格，可横向滚动');
    table.before(wrapper);
    wrapper.append(table);
  });
  chapters.forEach((section, index) => {
    const navigation = document.createElement('nav');
    navigation.className = 'page-nav';
    navigation.setAttribute('aria-label', '教程翻页');
    const destinations = [];
    if (index > 0) destinations.push([chapters[index - 1].id, '← 上一节']);
    destinations.push(['bookTop', '回到教程首页 ↑']);
    if (index < chapters.length - 1) destinations.push([chapters[index + 1].id, '下一节 →']);
    destinations.forEach(([id, label]) => {
      const link = document.createElement('a');
      link.href = '#' + id;
      link.textContent = label;
      navigation.append(link);
    });
    section.append(navigation);
  });

  let headings = [];
  let chapterPositions = [];
  let activeSection;
  let activeHeading;
  let framePending = false;
  let saveTimer;
  function outline(section) {
    const container = $('#sectionOutline');
    container.replaceChildren();
    $$('h3', section).forEach(heading => {
      const link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.replace(/^\d+\.\d+\s*/, '');
      link.title = heading.textContent;
      container.append(link);
    });
    if (!container.childElementCount) {
      const link = document.createElement('a');
      link.href = '#' + section.id;
      link.textContent = $('h2', section).textContent;
      container.append(link);
    }
  }
  function rebuildPositions() {
    chapterPositions = chapters.map(section => ({ section, top: section.getBoundingClientRect().top + scrollY }));
    headings = $$('h3', $('.content')).map(element => ({ element, top: element.getBoundingClientRect().top + scrollY }));
    scheduleUpdate();
  }
  function lastBefore(items, position) {
    let low = 0, high = items.length - 1, result = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (items[middle].top <= position) { result = middle; low = middle + 1; }
      else high = middle - 1;
    }
    return result;
  }
  function updateReadingPosition() {
    framePending = false;
    const fullHeight = document.documentElement.scrollHeight - innerHeight;
    const fraction = fullHeight > 0 ? Math.min(1, Math.max(0, scrollY / fullHeight)) : 0;
    $('#progress').style.transform = `scaleX(${fraction})`;
    $('#readingPercent').textContent = `${Math.round(fraction * 100)}%`;
    const position = scrollY + 112;
    const chapterIndex = lastBefore(chapterPositions, position);
    const section = chapters[Math.max(0, chapterIndex)];
    if (section !== activeSection) {
      activeSection = section;
      chapterLinks.forEach(link => {
        const active = link.hash === '#' + section.id;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      const title = $('h2', section).textContent;
      $('#currentChapter').textContent = title;
      outline(section);
      if (desktop.matches) {
        const link = $('.toc a.active');
        const toc = $('#toc');
        if (link.offsetTop < toc.scrollTop || link.offsetTop + link.offsetHeight > toc.scrollTop + toc.clientHeight) toc.scrollTop = link.offsetTop - toc.offsetTop - toc.clientHeight / 2;
      }
    }
    const headingIndex = lastBefore(headings, position);
    const heading = headingIndex >= 0 && headings[headingIndex].element.closest('.chapter') === section ? headings[headingIndex].element : null;
    if (heading !== activeHeading) {
      activeHeading = heading;
      $$('#sectionOutline a').forEach(link => {
        const active = link.hash === '#' + heading?.id;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    if (chapterIndex >= 0) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store.set('netbook-position', JSON.stringify({ section: section.id, target: heading?.id || section.id })), 350);
    }
  }
  function scheduleUpdate() {
    if (!framePending) { framePending = true; requestAnimationFrame(updateReadingPosition); }
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', rebuildPositions, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(rebuildPositions).observe($('.content'));
  document.fonts?.ready.then(rebuildPositions);
  rebuildPositions();
  try {
    const saved = JSON.parse(store.get('netbook-position'));
    const section = saved && document.getElementById(saved.section);
    const target = saved && document.getElementById(saved.target);
    if (section?.matches('.chapter') && target && section.contains(target)) {
      const resume = $('#resumeReading');
      resume.href = '#' + target.id;
      resume.hidden = false;
      resume.title = $('h2', section).textContent;
    }
  } catch { /* Ignore malformed or obsolete position data. */ }

  // Expand native details for print, then restore precisely the previous state.
  let printDetails = null;
  window.addEventListener('beforeprint', () => {
    if (printDetails) return;
    printDetails = $$('details').map(element => [element, element.open]);
    printDetails.forEach(([element]) => { element.open = true; });
  });
  window.addEventListener('afterprint', () => {
    printDetails?.forEach(([element, open]) => { element.open = open; });
    printDetails = null;
  });
})();
