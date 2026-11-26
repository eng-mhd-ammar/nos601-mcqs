(function () {
  "use strict";

  const STORAGE_KEY = "nos601-answers-v1";
  const CONFIRMED_KEY = "nos601-confirmed-v1";
  const PRE_SOLVED_KEY = "nos601-presolved-v1";
  const PRE_SOLVE_MIN = 100;
  const PRE_SOLVE_MAX = 500;

  const els = {
    totalCount: document.getElementById("totalCount"),
    preCount: document.getElementById("preCount"),
    answeredCount: document.getElementById("answeredCount"),
    scoreValue: document.getElementById("scoreValue"),
    searchInput: document.getElementById("searchInput"),
    sectionFilter: document.getElementById("sectionFilter"),
    pageSize: document.getElementById("pageSize"),
    btnScoreAll: document.getElementById("btnScoreAll"),
    btnReset: document.getElementById("btnReset"),
    loadMsg: document.getElementById("loadMsg"),
    quizList: document.getElementById("quizList"),
    pager: document.getElementById("pager"),
    prevPage: document.getElementById("prevPage"),
    nextPage: document.getElementById("nextPage"),
    pageInfo: document.getElementById("pageInfo"),
  };

  let allQuestions = [];
  let filtered = [];
  let userAnswers = loadAnswers();
  let confirmedIds = loadConfirmed();
  let preSolved = new Set();
  let lastScore = null;
  let currentPage = 1;

  function shuffleIds(ids) {
    const arr = ids.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickPreSolvedCount(total) {
    const lo = Math.min(PRE_SOLVE_MIN, total);
    const hi = Math.min(PRE_SOLVE_MAX, total);
    if (hi <= lo) return total;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function loadOrCreatePreSolved(ids) {
    const valid = new Set(ids);
    try {
      const raw = sessionStorage.getItem(PRE_SOLVED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const total = Number(parsed.total);
        if (
          Array.isArray(parsed.ids) &&
          parsed.ids.length > 0 &&
          total === ids.length &&
          parsed.ids.every((id) => valid.has(id))
        ) {
          return new Set(parsed.ids);
        }
      }
    } catch {
      /* ignore */
    }

    const n = pickPreSolvedCount(ids.length);
    const picked = shuffleIds(ids).slice(0, n);
    sessionStorage.setItem(
      PRE_SOLVED_KEY,
      JSON.stringify({ total: ids.length, ids: picked })
    );
    return new Set(picked);
  }

  function loadAnswers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveAnswers() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userAnswers));
  }

  function loadConfirmed() {
    try {
      const raw = localStorage.getItem(CONFIRMED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveConfirmed() {
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...confirmedIds]));
  }

  function isConfirmed(id) {
    return confirmedIds.has(id) || preSolved.has(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortSection(name) {
    if (!name) return "—";
    return name.length > 72 ? name.slice(0, 69) + "…" : name;
  }

  function applyFilters() {
    const q = els.searchInput.value.trim().toLowerCase();
    const sec = els.sectionFilter.value;
    filtered = allQuestions.filter((item) => {
      if (sec && item.section !== sec) return false;
      if (q && !item.text.toLowerCase().includes(q)) return false;
      return true;
    });
    currentPage = 1;
    render();
  }

  function pageSlice() {
    const size = Number(els.pageSize.value) || 20;
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * size;
    return {
      size,
      totalPages,
      items: filtered.slice(start, start + size),
    };
  }

  function countAnswered() {
    return allQuestions.filter((q) => userAnswers[q.id]).length;
  }

  function scorePercent() {
    if (!allQuestions.length) return null;
    let correct = 0;
    for (const q of allQuestions) {
      let pick;
      if (preSolved.has(q.id)) {
        pick = q.answer;
      } else if (confirmedIds.has(q.id)) {
        pick = userAnswers[q.id];
      } else {
        pick = null;
      }
      if (pick === q.answer) correct += 1;
    }
    return Math.round((correct / allQuestions.length) * 100);
  }

  function updateStats() {
    els.totalCount.textContent = String(allQuestions.length);
    els.preCount.textContent = String(preSolved.size);
    els.answeredCount.textContent = String(countAnswered());
    els.scoreValue.textContent = lastScore === null ? "—" : String(lastScore);
  }

  function showFeedback(card, question, reveal) {
    const box = card.querySelector(".result-feedback");
    if (!box || !reveal) return;
    const pick = preSolved.has(question.id)
      ? question.answer
      : userAnswers[question.id];
    const ok = pick === question.answer;
    box.className = "result-feedback show " + (ok ? "ok" : "bad");
    box.textContent = ok ? "إجابة صحيحة ✓" : "إجابة خاطئة ✗";
  }

  function lockQuestion(card) {
    card.querySelectorAll('.option input[type="radio"]').forEach((inp) => {
      inp.disabled = true;
    });
    card.querySelectorAll(".option").forEach((el) => el.classList.add("disabled"));
    const btn = card.querySelector(".btn-confirm");
    if (btn) btn.disabled = true;
  }

  function confirmQuestion(q, card) {
    if (preSolved.has(q.id)) return;
    const pick = userAnswers[q.id];
    if (!pick) {
      alert("اختر إجابة قبل التأكيد.");
      return;
    }
    confirmedIds.add(q.id);
    saveConfirmed();
    markOptions(card, q, true);
    showFeedback(card, q, true);
    lockQuestion(card);
    updateStats();
  }

  function applyPendingSelection(card) {
    card.querySelectorAll(".option").forEach((label) => {
      label.classList.remove("selected-pending");
      const inp = label.querySelector("input");
      if (inp && inp.checked && !inp.disabled) {
        label.classList.add("selected-pending");
      }
    });
  }

  function markOptions(card, question, reveal) {
    const inputs = card.querySelectorAll(".option");
    inputs.forEach((label) => {
      const letter = label.dataset.letter;
      label.classList.remove("correct", "wrong-pick", "selected-pending");
      if (!reveal) return;

      const inp = label.querySelector("input");
      const isAnswer = letter === question.answer;
      const isUserPick = inp && inp.checked;

      if (isAnswer) label.classList.add("correct");
      if (isUserPick && !isAnswer) label.classList.add("wrong-pick");
    });
  }

  function render() {
    const { size, totalPages, items } = pageSlice();
    els.quizList.innerHTML = "";
    if (!filtered.length) {
      els.loadMsg.textContent = "لا توجد أسئلة مطابقة للبحث.";
      els.loadMsg.hidden = false;
      els.pager.hidden = true;
      return;
    }
    els.loadMsg.hidden = true;
    els.pager.hidden = false;
    els.pageInfo.textContent = `صفحة ${currentPage} من ${totalPages} (${filtered.length} سؤال)`;

    items.forEach((q) => {
      const isPre = preSolved.has(q.id);
      const confirmed = isConfirmed(q.id);
      const selected = isPre ? q.answer : userAnswers[q.id] || "";

      const card = document.createElement("article");
      card.className = "card" + (isPre ? " presolved" : "");
      card.dataset.id = String(q.id);

      const tools = document.createElement("div");
      tools.className = "card-tools";
      const hintBtn = document.createElement("button");
      hintBtn.type = "button";
      hintBtn.className = "btn btn-hint ghost";
      hintBtn.textContent = "تلميح";
      const hintBox = document.createElement("div");
      hintBox.className = "hint";
      hintBox.textContent = q.hint;
      hintBtn.addEventListener("click", () => hintBox.classList.toggle("show"));

      if (!isPre) {
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "btn btn-confirm";
        confirmBtn.textContent = "تأكيد الإجابة";
        confirmBtn.disabled = confirmed;
        confirmBtn.addEventListener("click", () => confirmQuestion(q, card));
        tools.appendChild(confirmBtn);
      }

      tools.appendChild(hintBtn);
      if (isPre) {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "محلول مسبقاً";
        tag.style.marginRight = "auto";
        tools.prepend(tag);
      }

      card.innerHTML =
        '<div class="card-head">' +
        `<span>#${q.id}</span>` +
        `<span class="badge" title="${escapeHtml(q.section)}">${escapeHtml(shortSection(q.section))}</span>` +
        "</div>" +
        `<p class="q-text">${escapeHtml(q.text)}</p>` +
        '<div class="options"></div>' +
        '<div class="result-feedback" aria-live="polite"></div>';

      const opts = card.querySelector(".options");
      q.options.forEach((opt) => {
        const id = `q${q.id}-${opt.letter}`;
        const label = document.createElement("label");
        const locked = isPre || confirmed;
        label.className = "option" + (locked ? " disabled" : "");
        label.dataset.letter = opt.letter;
        label.innerHTML =
          `<input type="radio" name="q${q.id}" id="${id}" value="${opt.letter}" ` +
          (selected === opt.letter ? "checked " : "") +
          (locked ? "disabled " : "") +
          "/>" +
          `<span><strong>${opt.letter})</strong> ${escapeHtml(opt.text)}</span>`;
        if (!locked) {
          label.querySelector("input").addEventListener("change", (e) => {
            userAnswers[q.id] = e.target.value;
            saveAnswers();
            updateStats();
            applyPendingSelection(card);
          });
        }
        opts.appendChild(label);
      });

      card.appendChild(hintBox);
      card.appendChild(tools);

      if (!confirmed && !isPre) {
        applyPendingSelection(card);
      }

      if (confirmed) {
        markOptions(card, q, true);
        showFeedback(card, q, true);
        if (!isPre) lockQuestion(card);
      }

      els.quizList.appendChild(card);
    });

    updateStats();
  }

  function scoreAll() {
    lastScore = scorePercent();
    updateStats();
    const correct = Math.round((lastScore / 100) * allQuestions.length);
    const confirmedCount = confirmedIds.size + preSolved.size;
    alert(
      `العلامة من 100: ${lastScore}\n` +
        `صحيح: ${correct} من ${allQuestions.length}\n` +
        `مؤكَّد: ${confirmedCount} سؤالاً (منها ${preSolved.size} محلول مسبقاً)\n` +
        `ملاحظة: الأسئلة غير المؤكدة تُحسب كأخطاء.`
    );
  }

  function resetUser() {
    if (!confirm("هل تريد مسح إجاباتك المحفوظة؟ الأسئلة المحلولة مسبقاً تبقى كما هي.")) return;
    userAnswers = {};
    confirmedIds = new Set();
    preSolved.forEach((id) => {
      const q = allQuestions.find((x) => x.id === id);
      if (q) userAnswers[id] = q.answer;
    });
    lastScore = null;
    saveAnswers();
    saveConfirmed();
    render();
  }

  function fillSections() {
    const sections = [...new Set(allQuestions.map((q) => q.section))].sort();
    sections.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = shortSection(s);
      opt.title = s;
      els.sectionFilter.appendChild(opt);
    });
  }

  function init() {
    fetch("questions.json")
      .then((r) => {
        if (!r.ok) throw new Error("تعذر تحميل questions.json");
        return r.json();
      })
      .then((data) => {
        allQuestions = data;
        preSolved = loadOrCreatePreSolved(allQuestions.map((q) => q.id));
        preSolved.forEach((id) => {
          const q = allQuestions.find((x) => x.id === id);
          if (q) {
            userAnswers[id] = q.answer;
            confirmedIds.add(id);
          }
        });
        saveConfirmed();
        fillSections();
        filtered = allQuestions.slice();
        els.loadMsg.hidden = true;
        updateStats();
        render();
      })
      .catch((err) => {
        els.loadMsg.textContent = "خطأ: " + err.message;
      });

    els.searchInput.addEventListener("input", debounce(applyFilters, 280));
    els.sectionFilter.addEventListener("change", applyFilters);
    els.pageSize.addEventListener("change", () => {
      currentPage = 1;
      render();
    });
    els.prevPage.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        render();
      }
    });
    els.nextPage.addEventListener("click", () => {
      const { totalPages } = pageSlice();
      if (currentPage < totalPages) {
        currentPage++;
        render();
      }
    });
    els.btnScoreAll.addEventListener("click", scoreAll);
    els.btnReset.addEventListener("click", resetUser);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  init();
})();