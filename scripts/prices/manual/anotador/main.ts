import {
  buildExport,
  filterFoods,
  lastFoodFor,
  localDay,
  parseState,
  progress,
  saveEntry,
  savedMessage,
  suggestFood,
  type CaptureState,
} from "../capture.ts";
import type { SlimFood, StoreSite } from "../format.ts";
import { confirmsPack, readProductPage, type PageProduct } from "../pageReader.ts";

// "Anotar precio" bookmarklet entry (bundled by build.ts). Runs only when the
// person clicks it, on the page they are viewing. It reads that page's own HTML,
// never requests anything, and keeps entries in this store's localStorage until
// the person exports them. Page text is untrusted: it is only ever set with
// textContent / value, inside a closed Shadow DOM.

declare const __ANOTADOR_SITES__: StoreSite[];
declare const __ANOTADOR_FOODS__: SlimFood[];

const HOST_ID = "fitmarket-anotador";
const STORAGE_PREFIX = "fitmarket-anotador:v1:";

const STYLE = `
:host { all: initial; }
[hidden] { display: none !important; }
.box { position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 340px; max-height: calc(100vh - 32px);
  overflow: auto; box-sizing: border-box; padding: 14px 16px; background: #fff; color: #1d1d1f; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.25); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h2 { margin: 0 0 8px; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid #c7c7cc; background: #f2f2f7; padding: 6px 12px; }
button.primary { background: #0a7d3b; border-color: #0a7d3b; color: #fff; }
button.close { border: none; background: none; font-size: 20px; padding: 0 4px; }
label { display: block; margin-top: 10px; font-weight: 600; }
input, select { font: inherit; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px; border: 1px solid #c7c7cc; border-radius: 6px; }
input[type=checkbox] { width: auto; margin: 0 6px 0 0; }
.check { display: flex; align-items: flex-start; font-weight: 400; }
.row { display: flex; gap: 8px; margin-top: 12px; }
.pack { display: flex; gap: 6px; align-items: center; }
.pack input { width: 110px; }
.muted { color: #6e6e73; font-size: 12px; }
.error { color: #b00020; }
.ok { color: #0a7d3b; }
.card { background: #f5f5f7; border-radius: 8px; padding: 8px 10px; }
.status { min-height: 1.4em; margin-top: 8px; }
.confirm { margin-top: 10px; padding: 10px; border: 2px solid #b26a00; background: #fff4e5; border-radius: 8px; }
.confirm p { margin: 0 0 8px; }
.confirm .row { margin-top: 0; flex-wrap: wrap; }
.counter-updated { color: #0a7d3b; font-weight: 600; }
details { margin-top: 8px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<"className" | "textContent" | "type" | "placeholder", string>> = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) (node as unknown as Record<string, string>)[k] = v as string;
  for (const c of children) node.appendChild(c);
  return node;
}

const money = (cop: number) => `$ ${new Intl.NumberFormat("es-CO").format(cop)}`;
const unitLabel = (food: SlimFood | undefined) => (!food ? "" : food.unit === "unit" ? "unidades" : food.unit);

function documentUrl(): string {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.name || location.href;
}

function loadState(site: StoreSite, foods: SlimFood[]): CaptureState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_PREFIX + site.storeId);
  } catch {
    raw = null;
  }
  return parseState(raw, site.storeId, foods, site);
}

function storeState(state: CaptureState): boolean {
  try {
    localStorage.setItem(STORAGE_PREFIX + state.store, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function download(fileName: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function main(): void {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove(); // second click closes the panel
    return;
  }
  const sites = __ANOTADOR_SITES__;
  const foods = __ANOTADOR_FOODS__;
  const html = document.documentElement.outerHTML; // read before the panel is added
  const read = readProductPage({
    html,
    href: location.href,
    documentUrl: documentUrl(),
    sites,
    extraPackCandidates: foods.map((f) => f.defaultPack),
  });
  const site = sites.find((s) => s.host === location.hostname);

  const host = el("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const box = el("div", { className: "box" });
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Anotar precio");
  const close = el("button", { className: "close", textContent: "×" });
  close.setAttribute("aria-label", "Cerrar");
  close.addEventListener("click", () => host.remove());
  box.appendChild(el("h2", {}, [el("span", { textContent: "Anotar precio · FitMarket" }), close]));
  shadow.append(el("style", { textContent: STYLE }), box);
  document.body.appendChild(host);

  if (!site) {
    box.appendChild(el("p", { className: "error", textContent: read.ok ? "" : read.message }));
    return;
  }

  let state = loadState(site, foods);
  const status = el("p", { className: "status" });
  status.setAttribute("role", "status");
  const counter = el("p", { className: "muted" });
  const missingList = el("p", { className: "muted" });
  const missingSummary = el("summary");
  const say = (text: string, kind: "ok" | "error" | "" = "") => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };
  const refreshProgress = (updated = false) => {
    const p = progress(state, foods);
    counter.textContent = `${p.done} de ${p.total} anotados en ${site.storeId}`;
    counter.className = updated ? "muted counter-updated" : "muted";
    missingSummary.textContent = `Faltan ${p.missing.length}`;
    missingList.textContent = p.missing.join(", ");
  };

  const exportBtn = el("button", { textContent: "Exportar" });
  exportBtn.addEventListener("click", () => {
    const out = buildExport(state, localDay(new Date()));
    if (!out) return say("Aún no has guardado ningún producto.", "error");
    download(out.fileName, out.data);
    say(`Descargado ${out.fileName}. Entrégale ese archivo al desarrollador.`, "ok");
  });

  if (read.ok) {
    renderProduct(read.product);
  } else {
    box.appendChild(el("p", { className: "error", textContent: read.message }));
  }
  box.append(status, el("div", { className: "row" }, [exportBtn]), counter, el("details", {}, [missingSummary, missingList]));
  refreshProgress();

  function renderProduct(product: PageProduct): void {
    const current = site as StoreSite;
    box.appendChild(
      el("div", { className: "card" }, [
        el("div", { textContent: product.name }),
        el("div", { textContent: `Precio normal: ${money(product.regularPriceCop)}` }),
        el("div", { className: "muted", textContent: `Tienda: ${current.storeId}` }),
      ]),
    );

    const search = el("input", { type: "search", placeholder: "Buscar alimento..." });
    search.setAttribute("aria-label", "Buscar alimento");
    const select = el("select");
    select.size = 6;
    select.setAttribute("aria-label", "Alimento");
    let chosen = lastFoodFor(state, product.externalId) ?? suggestFood(product.name, foods) ?? "";
    const fillOptions = () => {
      select.replaceChildren(
        ...filterFoods(search.value, foods).map((f) => {
          const o = el("option", { textContent: f.nameEs });
          o.value = f.id;
          o.selected = f.id === chosen;
          return o;
        }),
      );
    };
    search.addEventListener("input", fillOptions);

    // In-panel question shown before replacing another saved product (never alert/confirm: they block the page).
    const confirmText = el("p");
    const replaceYes = el("button", { className: "primary", textContent: "Sí, reemplazar" });
    const replaceNo = el("button", { textContent: "No, cambiar el alimento" });
    const confirmBox = el("div", { className: "confirm" }, [confirmText, el("div", { className: "row" }, [replaceYes, replaceNo])]);
    confirmBox.setAttribute("role", "alertdialog");
    confirmBox.hidden = true;
    const hideConfirm = () => {
      confirmBox.hidden = true;
    };

    const pack = el("input", { type: "number" });
    pack.min = "0";
    pack.step = "any";
    pack.setAttribute("aria-label", "Tamaño del paquete");
    if (product.packSize !== null) pack.value = String(product.packSize);
    const unit = el("span");
    const packNote = el("p", { className: "muted" });
    // Shown only when the page does not confirm the pack: the person must say they checked it by hand.
    const reviewed = el("input", { type: "checkbox" });
    const reviewedRow = el("label", { className: "check" }, [reviewed, document.createTextNode("Revisé el tamaño a mano")]);
    let packConfirmed = false;
    const refreshPack = () => {
      unit.textContent = unitLabel(foods.find((f) => f.id === chosen));
      const n = Number(pack.value);
      packConfirmed = pack.value !== "" && n > 0 && confirmsPack(current.storeId, html, n);
      reviewedRow.hidden = packConfirmed;
      if (packConfirmed) reviewed.checked = false;
      if (pack.value === "" || !(n > 0)) {
        packNote.textContent = "Escribe el tamaño que dice la página (por ejemplo 500 g o 12 unidades).";
        packNote.className = "muted";
      } else if (packConfirmed) {
        packNote.textContent = "✓ Coincide con la página.";
        packNote.className = "ok";
      } else {
        packNote.textContent = "⚠ No pude confirmarlo en la página: revisa el tamaño en la página y marca la casilla de abajo.";
        packNote.className = "error";
      }
    };
    pack.addEventListener("input", () => {
      hideConfirm();
      refreshPack();
    });
    select.addEventListener("change", () => {
      hideConfirm();
      chosen = select.value;
      refreshPack();
    });

    // Always starts unticked: the person confirms Bucaramanga on every product page.
    const attest = el("input", { type: "checkbox" });
    attest.checked = false;
    attest.addEventListener("change", hideConfirm);
    const save = el("button", { className: "primary", textContent: "Guardar" });
    const trySave = (replaceConfirmed: boolean) => {
      hideConfirm();
      const result = saveEntry(state, {
        product,
        foodId: chosen,
        packSize: Number(pack.value),
        packConfirmed,
        packReviewed: reviewed.checked,
        attested: attest.checked,
        today: localDay(new Date()),
        foods,
        site: current,
        replaceConfirmed,
      });
      if (!result.ok && result.needsConfirmation === true) {
        say("");
        confirmText.textContent = result.message;
        confirmBox.hidden = false;
        replaceNo.focus();
        return;
      }
      if (!result.ok) return say(result.message, "error");
      if (!storeState(result.state)) return say("No pude guardar en este navegador (almacenamiento bloqueado).", "error");
      state = result.state;
      say(`${savedMessage(result, foods)}. Abre el siguiente producto y vuelve a tocar el botón.`, "ok");
      refreshProgress(true);
    };
    save.addEventListener("click", () => trySave(false));
    replaceYes.addEventListener("click", () => trySave(true));
    replaceNo.addEventListener("click", () => {
      hideConfirm();
      say("Nada cambió. Elige el alimento correcto en la lista y vuelve a tocar Guardar.");
      search.focus();
    });

    box.append(
      el("label", { textContent: "¿Qué alimento es?" }),
      search,
      select,
      el("label", { textContent: "Tamaño del paquete" }),
      el("div", { className: "pack" }, [pack, unit]),
      packNote,
      reviewedRow,
      el("label", { className: "check" }, [attest, document.createTextNode("Tengo Bucaramanga seleccionada en esta tienda")]),
      el("div", { className: "row" }, [save]),
      confirmBox,
    );
    fillOptions();
    refreshPack();
  }
}

main();
