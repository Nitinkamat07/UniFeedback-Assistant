const $ = id => document.getElementById(id);
let scannedFields = [];

function setStatus(message, type = "") {
  $("status").textContent = message;
  $("status").className = `status ${type}`;
}
function clean(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}
function normalizeRating(text) {
  return (text || "").toLowerCase().replace(/^[a-e]\s*[\).]\s*/, "").replace(/\s+/g, " ").trim();
}
function uniqueRatingOptions(fields) {
  const map = new Map();
  fields.forEach(field => field.options.forEach(option => {
    const key = normalizeRating(option.text);
    if (key && !map.has(key)) map.set(key, option.text);
  }));
  return [...map].map(([value, text]) => ({value, text}));
}
function fillSelect(select, options, preferred) {
  select.innerHTML = "";
  options.forEach(item => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.text;
    select.append(option);
  });
  const preferredOption = options.find(o => normalizeRating(o.text) === normalizeRating(preferred));
  if (preferredOption) select.value = preferredOption.value;
}
function renderQuestions() {
  const host = $("questions");
  host.innerHTML = "";
  scannedFields.forEach((field, index) => {
    const card = document.createElement("div");
    card.className = "question";
    const top = document.createElement("div");
    top.className = "question-top";
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(index + 1);
    const textWrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "q-label";
    label.textContent = field.label || `Feedback question ${index + 1}`;
    const meta = document.createElement("div");
    meta.className = "q-meta";
    meta.textContent = field.currentText
      ? `Current: ${field.currentText}`
      : `${field.type === "radio" ? "Radio-button question" : "Dropdown"} · unanswered`;
    textWrap.append(label, meta);
    top.append(number, textWrap);

    const select = document.createElement("select");
    select.dataset.index = String(index);
    select.setAttribute("aria-label", `Rating for question ${index + 1}`);
    field.options.forEach(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.text;
      select.append(option);
    });
    const current = field.options.find(o => String(o.value) === String(field.currentValue));
    if (current) select.value = current.value;
    card.append(top, select);
    host.append(card);
  });
}
async function activeTab() {
  const tabs = await chrome.tabs.query({active:true, currentWindow:true});
  if (!tabs[0]?.id) throw new Error("Could not identify the active tab.");
  return tabs[0];
}

async function scan() {
  $("scanBtn").disabled = true;
  $("refreshBtn").disabled = true;
  setStatus("Scanning visible feedback questions…");
  try {
    const tab = await activeTab();
    const result = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        const clean = value => (value || "").replace(/\s+/g, " ").trim();
        const visible = el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
            style.display !== "none" && style.visibility !== "hidden";
        };
        const marker = `uf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optionLabel = el => {
          const labels = el.labels ? [...el.labels].map(x => clean(x.innerText || x.textContent)).filter(Boolean) : [];
          if (labels.length) return labels.join(" / ");
          const label = el.closest("label");
          if (label) return clean(label.innerText || label.textContent);
          return clean(el.parentElement?.innerText || el.parentElement?.textContent || el.value);
        };
        const ratingLike = text =>
          /excellent|very\s*good|good|fair|poor|satisfactory|unsatisfactory|strongly\s*agree|agree|neutral|disagree|average/i.test(text);
        const getQuestionLabel = (elements, optionTexts, fallback) => {
          const first = elements[0];
          const candidates = [];
          const selector = "fieldset,tr,[role='row'],.form-group,.form-row,.question,[class*='question'],td,.col";
          let node = first.parentElement;
          for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
            if (node.matches?.(selector)) {
              const text = clean(node.innerText || node.textContent);
              if (text && text.length < 700) candidates.push(text);
            }
          }
          candidates.sort((a,b) => a.length - b.length);
          let text = candidates[0] || "";
          optionTexts.forEach(option => { if (option) text = clean(text.replace(option, " ")); });
          text = clean(text.replace(/\b(a|b|c|d|e)\s*[\)\.]\s*/gi, " "));
          if (text.length > 8) return text.slice(0, 260);
          const legend = first.closest("fieldset")?.querySelector("legend");
          return clean(legend?.innerText || legend?.textContent) || fallback;
        };

        const found = [];
        // Dropdowns get a private marker so Apply can target the exact scanned element.
        [...document.querySelectorAll("select")].filter(el =>
          visible(el) && !el.disabled && el.options.length > 1
        ).forEach((el, index) => {
          const options = [...el.options]
            .filter(o => o.value !== "")
            .map(o => ({value:String(o.value), text:clean(o.textContent)}))
            .filter(o => o.text);
          if (options.length < 2) return;
          const id = `${marker}-select-${index}`;
          el.setAttribute("data-unifeedback-target", id);
          found.push({
            type:"select", marker:id,
            label:getQuestionLabel([el], [], `Feedback dropdown ${index + 1}`),
            currentValue:String(el.value),
            currentText:clean(el.selectedOptions?.[0]?.textContent),
            options
          });
        });

        // Group radio inputs by native form name; use nearest question container
        // for unnamed controls. Mark each member, so Apply does not need to
        // reconstruct or guess the groups later.
        const radios = [...document.querySelectorAll('input[type="radio"]')]
          .filter(el => visible(el) && !el.disabled);
        const groups = new Map();
        const unnamedIds = new WeakMap();
        let unnamedCounter = 0;
        radios.forEach(el => {
          const container = el.closest("fieldset,tr,.form-group,.form-row,.question,[class*='question']") || el.parentElement;
          if (!el.name && container && !unnamedIds.has(container)) unnamedIds.set(container, ++unnamedCounter);
          const formId = el.form ? [...document.forms].indexOf(el.form) : -1;
          const key = el.name ? `named:${formId}:${el.name}` :
            `unnamed:${container ? unnamedIds.get(container) : ++unnamedCounter}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(el);
        });
        let radioIndex = 0;
        groups.forEach(group => {
          if (group.length < 2) return;
          const options = group.map(el => ({value:String(el.value), text:optionLabel(el)}));
          if (options.some(o => !o.text) || !options.some(o => ratingLike(o.text))) return;
          const id = `${marker}-radio-${radioIndex++}`;
          group.forEach(el => el.setAttribute("data-unifeedback-target", id));
          const checked = group.find(el => el.checked);
          found.push({
            type:"radio", marker:id, name:group[0].name || "",
            label:getQuestionLabel(group, options.map(o => o.text), `Feedback question ${radioIndex}`),
            currentValue:checked ? String(checked.value) : "",
            currentText:checked ? optionLabel(checked) : "",
            options
          });
        });
        return found;
      }
    });
    scannedFields = result?.[0]?.result || [];
    if (!scannedFields.length) {
      $("controls").classList.add("hidden");
      setStatus("No feedback dropdowns or rating radio buttons found. Open the actual questions and scan again.", "error");
      return;
    }
    const options = uniqueRatingOptions(scannedFields);
    fillSelect($("sameRating"), options, "Good");
    $("count").textContent = `${scannedFields.length} questions`;
    $("controls").classList.remove("hidden");
    renderQuestions();
    const radioCount = scannedFields.filter(f => f.type === "radio").length;
    const dropdownCount = scannedFields.length - radioCount;
    setStatus(`Found ${scannedFields.length} questions (${radioCount} radio groups, ${dropdownCount} dropdowns). Choose ratings and apply.`, "success");
    await chrome.storage.local.set({
      lastMode:$("mode").value,
      lastOnlyEmpty:$("onlyEmpty").checked
    });
  } catch (error) {
    setStatus(error.message || "Could not scan this page. Reload the page and try again.", "error");
  } finally {
    $("scanBtn").disabled = false;
    $("refreshBtn").disabled = false;
  }
}

async function applyRatings() {
  if (!scannedFields.length) return;
  const mode = $("mode").value;
  const onlyEmpty = $("onlyEmpty").checked;
  const individual = [...$("questions").querySelectorAll("select")].map(el => el.value);
  const sameRatingKey = $("sameRating").value;
  const assignments = scannedFields.map((field, index) => {
    const chosen = mode === "same"
      ? field.options.find(option => normalizeRating(option.text) === sameRatingKey)
      : field.options.find(option => String(option.value) === String(individual[index]));
    return {
      type:field.type,
      marker:field.marker,
      value:chosen ? String(chosen.value) : "__rating_not_available__"
    };
  });

  $("applyBtn").disabled = true;
  setStatus("Applying your selected ratings…");
  try {
    const tab = await activeTab();
    const result = await chrome.scripting.executeScript({
      target: {tabId:tab.id},
      args:[assignments, onlyEmpty],
      func:async (assignments, onlyEmpty) => {
        let applied = 0, skipped = 0, missing = 0;
        const setNativeValue = (element, value) => {
          const proto = element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(proto, element instanceof HTMLSelectElement ? "value" : "checked");
          if (descriptor?.set) descriptor.set.call(element, value);
          else if (element instanceof HTMLSelectElement) element.value = value;
          else element.checked = value;
          element.dispatchEvent(new Event("input", {bubbles:true}));
          element.dispatchEvent(new Event("change", {bubbles:true}));
        };

        assignments.forEach(item => {
          // Use the exact DOM markers assigned during Scan. No question-text
          // matching or option-order reconstruction is involved.
          const members = [...document.querySelectorAll("[data-unifeedback-target]")]
            .filter(el => el.getAttribute("data-unifeedback-target") === item.marker);
          if (!members.length) { missing++; return; }

          if (item.type === "select") {
            const select = members.find(el => el instanceof HTMLSelectElement);
            if (!select) { missing++; return; }
            if (onlyEmpty && select.value !== "") { skipped++; return; }
            const option = [...select.options].find(o => String(o.value) === item.value);
            if (!option) { missing++; return; }
            setNativeValue(select, item.value);
            applied++;
          } else if (item.type === "radio") {
            const radios = members.filter(el => el instanceof HTMLInputElement && el.type === "radio");
            if (radios.length < 2) { missing++; return; }
            if (onlyEmpty && radios.some(el => el.checked)) { skipped++; return; }
            const target = radios.find(el => String(el.value) === item.value);
            if (!target) { missing++; return; }

            // Use the browser's native click path for radio inputs. Some LMS
            // feedback pages save answers from click handlers rather than
            // programmatic checked/input/change updates.
            target.click();

            // Confirm the intended option is selected in the live DOM.
            if (!target.checked) { missing++; return; }
            applied++;
          } else {
            missing++;
          }
        });
        // Allow the portal's autosave listeners a moment to process the clicks.
        await new Promise(resolve => setTimeout(resolve, 1200));
        return {applied, skipped, missing};
      }
    });
    const stats = result?.[0]?.result || {applied:0, skipped:0, missing:assignments.length};
    const type = stats.missing ? (stats.applied || stats.skipped ? "" : "error") : "success";
    setStatus(
      `Applied ${stats.applied}. Skipped ${stats.skipped} already answered. ${stats.missing} could not be found. Review every answer; the form was not submitted.`,
      type
    );
  } catch (error) {
    setStatus(error.message || "Could not apply ratings. Scan the page again.", "error");
  } finally {
    $("applyBtn").disabled = false;
  }
}

$("scanBtn").addEventListener("click", scan);
$("refreshBtn").addEventListener("click", scan);
$("applyBtn").addEventListener("click", applyRatings);
$("clearBtn").addEventListener("click", () => {
  scannedFields = [];
  $("controls").classList.add("hidden");
  setStatus("Scan results cleared.");
});
$("mode").addEventListener("change", () => {
  $("sameRatingWrap").style.display = $("mode").value === "same" ? "" : "none";
  $("questions").style.display = $("mode").value === "individual" ? "" : "none";
});
$("mode").dispatchEvent(new Event("change"));
(async () => {
  const saved = await chrome.storage.local.get(["lastMode","lastOnlyEmpty"]);
  if (saved.lastMode) $("mode").value = saved.lastMode;
  if (typeof saved.lastOnlyEmpty === "boolean") $("onlyEmpty").checked = saved.lastOnlyEmpty;
  $("mode").dispatchEvent(new Event("change"));
})();
