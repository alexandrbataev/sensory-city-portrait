const STORAGE_KEYS = {
  users: "spc_users",
  features: "spc_features",
  templates: "spc_templates",
  session: "spc_session",
};

const LAYERS = [
  { id: "emotional_anchors", name: "Эмоциональные якоря" },
  { id: "memory_marks", name: "Памятные метки" },
  { id: "personal_navigators", name: "Личные навигаторы" },
  { id: "best_place", name: "Лучшее место" },
  { id: "photo_anchors", name: "Фото-якоря" },
  { id: "infrastructure_feedback", name: "Инфраструктурный отклик" },
  { id: "hidden_treasures", name: "Скрытые сокровища" },
];

const BASE_TEMPLATES = {
  "Эмоции и память": ["emotional_anchors", "memory_marks", "photo_anchors"],
  "Практическая навигация": ["personal_navigators"],
  "Сенсорное восприятие": ["best_place"],
  "Карта городских проблем": ["infrastructure_feedback"],
  'Туристическая "Изюминка"': ["hidden_treasures"],
};

const state = {
  users: load(STORAGE_KEYS.users, []),
  features: load(STORAGE_KEYS.features, []),
  templates: load(STORAGE_KEYS.templates, {}),
  currentUserId: load(STORAGE_KEYS.session, null),
  activeLayers: new Set(LAYERS.map((l) => l.id)),
  selectedGeometry: null,
  drawing: { active: false, type: "point", layerId: LAYERS[0].id, points: [] },
  leafletLayers: {},
  leafletFeatureMap: new Map(),
  temp: { marker: null, polyline: null },
  userLocationLayer: null,
};

const map = L.map("map", { attributionControl: false }).setView([55.751244, 37.618423], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

for (const layer of LAYERS) {
  const group = L.layerGroup().addTo(map);
  state.leafletLayers[layer.id] = group;
}
addLocateControl();

const el = {
  authState: document.getElementById("auth-state"),
  registerForm: document.getElementById("register-form"),
  loginForm: document.getElementById("login-form"),
  logoutBtn: document.getElementById("logout-btn"),
  layerToggles: document.getElementById("layer-toggles"),
  templateSelect: document.getElementById("template-select"),
  applyTemplateBtn: document.getElementById("apply-template-btn"),
  saveTemplateBtn: document.getElementById("save-template-btn"),
  newTemplateName: document.getElementById("new-template-name"),
  featureLayerSelect: document.getElementById("feature-layer-select"),
  featureTypeSelect: document.getElementById("feature-type-select"),
  featureForm: document.getElementById("feature-form"),
  startDrawBtn: document.getElementById("start-draw-btn"),
  clearDrawBtn: document.getElementById("clear-draw-btn"),
  geolocateBtn: document.getElementById("geolocate-btn"),
  savedItems: document.getElementById("saved-items"),
};

init();

function init() {
  renderLayerControls();
  renderTemplateSelect();
  renderLayerSelect();
  renderFeatureForm();
  renderAuth();
  renderSavedItems();
  renderAllFeatures();
  bindEvents();
}

function bindEvents() {
  el.registerForm.addEventListener("submit", handleRegister);
  el.loginForm.addEventListener("submit", handleLogin);
  el.logoutBtn.addEventListener("click", handleLogout);

  el.applyTemplateBtn.addEventListener("click", applySelectedTemplate);
  el.saveTemplateBtn.addEventListener("click", saveCurrentTemplate);

  el.featureLayerSelect.addEventListener("change", () => {
    if (el.featureLayerSelect.value === "personal_navigators") {
      el.featureTypeSelect.value = "route";
    }
    renderFeatureForm();
  });

  el.featureTypeSelect.addEventListener("change", renderFeatureForm);

  el.startDrawBtn.addEventListener("click", () => {
    startDraw(el.featureTypeSelect.value, el.featureLayerSelect.value);
  });

  el.clearDrawBtn.addEventListener("click", clearDrawSelection);
  el.geolocateBtn.addEventListener("click", geolocate);

  el.featureForm.addEventListener("submit", handleFeatureSubmit);

  map.on("click", onMapClick);
  map.on("dblclick", onMapDoubleClick);
}

function addLocateControl() {
  const LocateControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control leaflet-control-locate");
      const button = L.DomUtil.create("a", "locate-btn", container);
      button.href = "#";
      button.title = "Моё местоположение";
      button.setAttribute("aria-label", "Моё местоположение");
      button.innerHTML = '<span class="locate-arrow" aria-hidden="true">➤</span>';

      L.DomEvent.on(button, "click", (event) => {
        L.DomEvent.stop(event);
        focusOnCurrentLocation();
      });
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    },
  });

  new LocateControl().addTo(map);
}

function renderLayerControls() {
  el.layerToggles.innerHTML = "";
  for (const layer of LAYERS) {
    const row = document.createElement("label");
    row.className = "row";
    row.innerHTML = `<input type="checkbox" data-layer-id="${layer.id}" checked /> <span>${layer.name}</span>`;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => toggleLayer(layer.id, checkbox.checked));
    el.layerToggles.appendChild(row);
  }
}

function renderLayerSelect() {
  el.featureLayerSelect.innerHTML = LAYERS.map(
    (layer) => `<option value="${layer.id}">${layer.name}</option>`
  ).join("");
}

function renderTemplateSelect() {
  const opts = [];
  for (const [name] of Object.entries(BASE_TEMPLATES)) {
    opts.push(`<option value="base::${name}">${name} (системный)</option>`);
  }
  for (const [name] of Object.entries(state.templates)) {
    opts.push(`<option value="user::${name}">${name} (пользовательский)</option>`);
  }
  el.templateSelect.innerHTML = opts.join("");
}

function renderFeatureForm() {
  const layerId = el.featureLayerSelect.value || "emotional_anchors";
  const type = el.featureTypeSelect.value;

  const common = `
    <input name="title" placeholder="Название/краткий заголовок" required />
    <textarea name="description" placeholder="Описание" required></textarea>
  `;

  let extra = "";
  if (layerId === "emotional_anchors") {
    extra = `<label>Интенсивность эмоции (1-5)<input type="number" min="1" max="5" value="3" name="emotion" required /></label>`;
  }
  if (layerId === "memory_marks") {
    extra = `<label>Фото воспоминания<input type="file" name="photos" multiple accept="image/*" /></label>`;
  }
  if (layerId === "personal_navigators") {
    extra = `
      <input name="purpose" placeholder="Цель маршрута" required />
      <label>Фото маршрута<input type="file" name="photos" multiple accept="image/*" /></label>
      <div class="small">Для этого слоя рекомендуется тип "Маршрут".</div>
    `;
  }
  if (layerId === "best_place") {
    extra = `
      <label>Сенсорная модальность
        <select name="modality" required>
          <option value="Свет">Свет</option>
          <option value="Звук">Звук</option>
          <option value="Тишина">Тишина</option>
        </select>
      </label>
    `;
  }
  if (layerId === "photo_anchors") {
    extra = `<label>Фото-якоря<input type="file" name="photos" multiple accept="image/*" required /></label>`;
  }
  if (layerId === "infrastructure_feedback") {
    extra = `
      <label>Категория
        <select name="infraCategory" required>
          <option value="Идеально!">Идеально!</option>
          <option value="Требует внимания">Требует внимания</option>
        </select>
      </label>
    `;
  }
  if (layerId === "hidden_treasures") {
    extra = `<input name="secretTag" value="Секрет" readonly />`;
  }

  const geoHint =
    type === "point"
      ? '<div class="small">Сначала выберите положение точки на карте (или геолокацию).</div>'
      : '<div class="small">Поставьте минимум 2 точки маршрута и завершите двойным кликом.</div>';

  el.featureForm.innerHTML = `${common}${extra}${geoHint}<button type="submit">Сохранить объект</button>`;
}

function startDraw(type, layerId) {
  clearTempGeometry();
  state.selectedGeometry = null;
  state.drawing = { active: true, type, layerId, points: [] };
  if (type === "route") {
    map.doubleClickZoom.disable();
  }
}

function clearDrawSelection() {
  state.selectedGeometry = null;
  state.drawing = { ...state.drawing, active: false, points: [] };
  map.doubleClickZoom.enable();
  clearTempGeometry();
}

function onMapClick(event) {
  if (!state.drawing.active) return;

  const { lat, lng } = event.latlng;
  if (state.drawing.type === "point") {
    state.selectedGeometry = { type: "point", coords: [lat, lng] };
    clearTempGeometry();
    state.temp.marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    state.temp.marker.on("dragend", () => {
      const pos = state.temp.marker.getLatLng();
      state.selectedGeometry = { type: "point", coords: [pos.lat, pos.lng] };
    });
  } else {
    state.drawing.points.push([lat, lng]);
    if (!state.temp.polyline) {
      state.temp.polyline = L.polyline(state.drawing.points, { color: "#0d6f8a", weight: 4 }).addTo(map);
    } else {
      state.temp.polyline.setLatLngs(state.drawing.points);
    }
  }
}

function onMapDoubleClick() {
  if (!state.drawing.active || state.drawing.type !== "route") return;
  if (state.drawing.points.length < 2) return;

  state.selectedGeometry = { type: "route", coords: [...state.drawing.points] };
  state.drawing.active = false;
  map.doubleClickZoom.enable();
}

function clearTempGeometry() {
  if (state.temp.marker) {
    map.removeLayer(state.temp.marker);
    state.temp.marker = null;
  }
  if (state.temp.polyline) {
    map.removeLayer(state.temp.polyline);
    state.temp.polyline = null;
  }
}

async function geolocate() {
  if (!navigator.geolocation) {
    alert("Геолокация не поддерживается браузером.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      map.setView([lat, lng], 15);
      state.selectedGeometry = { type: "point", coords: [lat, lng] };
      clearTempGeometry();
      state.temp.marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      state.temp.marker.on("dragend", () => {
        const p = state.temp.marker.getLatLng();
        state.selectedGeometry = { type: "point", coords: [p.lat, p.lng] };
      });
    },
    () => alert("Не удалось определить местоположение.")
  );
}

function focusOnCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Геолокация не поддерживается браузером.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      map.setView([lat, lng], 16);
      renderUserLocation([lat, lng]);
    },
    () => {
      alert("Не удалось определить местоположение.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function renderUserLocation(coords) {
  if (state.userLocationLayer) {
    map.removeLayer(state.userLocationLayer);
  }

  const halo = L.circleMarker(coords, {
    radius: 18,
    stroke: false,
    fillColor: "#3b82f6",
    fillOpacity: 0.22,
    interactive: false,
  });

  const dot = L.circleMarker(coords, {
    radius: 7,
    color: "#ffffff",
    weight: 2,
    fillColor: "#2563eb",
    fillOpacity: 1,
  }).bindPopup("Вы здесь");

  state.userLocationLayer = L.layerGroup([halo, dot]).addTo(map);
  dot.openPopup();
}

async function handleFeatureSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const layerId = el.featureLayerSelect.value;
  const type = el.featureTypeSelect.value;

  if (!state.currentUserId) {
    alert("Для добавления данных нужно войти в аккаунт.");
    return;
  }

  if (!state.selectedGeometry || state.selectedGeometry.type !== type) {
    alert("Сначала выберите геометрию на карте.");
    return;
  }

  const data = new FormData(form);
  const photos = await filesToDataUrls(data.getAll("photos").filter(Boolean));

  const feature = {
    id: crypto.randomUUID(),
    layerId,
    type,
    geometry: state.selectedGeometry,
    title: text(data.get("title")),
    description: text(data.get("description")),
    createdAt: new Date().toISOString(),
    createdBy: state.currentUserId,
    props: {
      emotion: Number(data.get("emotion") || 0),
      purpose: text(data.get("purpose")),
      modality: text(data.get("modality")),
      infraCategory: text(data.get("infraCategory")),
      secretTag: text(data.get("secretTag")),
      photos,
    },
    reviews: [],
  };

  state.features.push(feature);
  persist(STORAGE_KEYS.features, state.features);
  renderFeature(feature);

  form.reset();
  renderFeatureForm();
  clearDrawSelection();
}

function toggleLayer(layerId, on) {
  const group = state.leafletLayers[layerId];
  if (on) {
    state.activeLayers.add(layerId);
    group.addTo(map);
  } else {
    state.activeLayers.delete(layerId);
    map.removeLayer(group);
  }
}

function applySelectedTemplate() {
  const value = el.templateSelect.value;
  if (!value) return;

  const [kind, name] = value.split("::");
  const template = kind === "base" ? BASE_TEMPLATES[name] : state.templates[name];
  if (!template) return;

  const active = new Set(template);
  for (const layer of LAYERS) {
    const checked = active.has(layer.id);
    const checkbox = el.layerToggles.querySelector(`input[data-layer-id="${layer.id}"]`);
    checkbox.checked = checked;
    toggleLayer(layer.id, checked);
  }
}

function saveCurrentTemplate() {
  const name = el.newTemplateName.value.trim();
  if (!name) {
    alert("Введите название шаблона.");
    return;
  }

  state.templates[name] = [...state.activeLayers];
  persist(STORAGE_KEYS.templates, state.templates);
  renderTemplateSelect();
  el.newTemplateName.value = "";
}

function renderAllFeatures() {
  for (const feature of state.features) {
    renderFeature(feature);
  }
}

function renderFeature(feature) {
  const layerGroup = state.leafletLayers[feature.layerId];
  if (!layerGroup) return;

  let layer;
  if (feature.type === "point") {
    layer = L.marker(feature.geometry.coords, { icon: iconFor(feature) });
  } else {
    layer = L.polyline(feature.geometry.coords, styleForRoute(feature));
  }

  layer.bindPopup(popupHtml(feature));
  layer.on("popupopen", () => wirePopupHandlers(feature.id));
  layer.addTo(layerGroup);
  state.leafletFeatureMap.set(feature.id, layer);
}

function rerenderFeature(featureId) {
  const oldLayer = state.leafletFeatureMap.get(featureId);
  if (oldLayer) {
    for (const group of Object.values(state.leafletLayers)) {
      if (group.hasLayer(oldLayer)) {
        group.removeLayer(oldLayer);
      }
    }
    state.leafletFeatureMap.delete(featureId);
  }

  const feature = state.features.find((f) => f.id === featureId);
  if (feature) renderFeature(feature);
}

function iconFor(feature) {
  const layerId = feature.layerId;
  let glyph = "•";
  let color = "#2f7f73";

  if (layerId === "emotional_anchors") {
    const value = feature.props.emotion || 3;
    glyph = value >= 3 ? "❤" : "◆";
    color = ["#7f1d1d", "#b91c1c", "#f59e0b", "#65a30d", "#15803d"][Math.max(0, Math.min(4, value - 1))];
  }
  if (layerId === "memory_marks") {
    glyph = "🕰";
    color = "#7c3aed";
  }
  if (layerId === "best_place") {
    const modality = feature.props.modality;
    glyph = modality === "Звук" ? "🔊" : modality === "Тишина" ? "🤫" : "👁";
    color = "#0d9488";
  }
  if (layerId === "photo_anchors") {
    glyph = "📷";
    color = "#0369a1";
  }
  if (layerId === "infrastructure_feedback") {
    glyph = feature.props.infraCategory === "Идеально!" ? "✅" : "⚠";
    color = feature.props.infraCategory === "Идеально!" ? "#15803d" : "#b91c1c";
  }
  if (layerId === "hidden_treasures") {
    glyph = "💎";
    color = "#7e22ce";
  }

  return L.divIcon({
    className: "custom-pin-wrap",
    html: `<div class="custom-pin" style="background:${color}">${glyph}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function styleForRoute(feature) {
  if (feature.layerId === "personal_navigators") {
    return { color: "#0f766e", weight: 5, opacity: 0.9 };
  }
  return { color: "#334155", weight: 4, opacity: 0.8 };
}

function popupHtml(feature) {
  const avg = averageRating(feature.reviews);
  const reviews = feature.reviews
    .map((r) => `<div><b>${escapeHtml(r.authorEmail)}</b> (${r.rating}/5): ${escapeHtml(r.comment || "")}</div>`)
    .join("");

  const photos = (feature.props.photos || [])
    .map((src) => `<img class="popup-img" src="${src}" alt="Изображение" />`)
    .join("");

  const details = detailsHtml(feature);
  const canInteract = Boolean(state.currentUserId);

  return `
    <div>
      <h3>${escapeHtml(feature.title)}</h3>
      <div>${escapeHtml(feature.description)}</div>
      ${details}
      ${photos}
      <hr />
      <div><b>Средняя оценка:</b> ${avg}</div>
      <div>${reviews || "Пока нет отзывов"}</div>
      <hr />
      <form id="review-form-${feature.id}" class="stack">
        <label>Оценка
          <select name="rating" ${canInteract ? "" : "disabled"}>
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
          </select>
        </label>
        <textarea name="comment" placeholder="Комментарий" ${canInteract ? "" : "disabled"}></textarea>
        <button type="submit" ${canInteract ? "" : "disabled"}>Добавить отзыв</button>
      </form>
      <button id="save-item-${feature.id}" class="popup-save-btn" ${canInteract ? "" : "disabled"}>Сохранить в аккаунт</button>
      ${canInteract ? "" : '<div class="small">Войдите в аккаунт для отзывов и сохранения.</div>'}
    </div>
  `;
}

function detailsHtml(feature) {
  if (feature.layerId === "emotional_anchors") {
    return `<div><b>Интенсивность:</b> ${feature.props.emotion || "-"}</div>`;
  }
  if (feature.layerId === "personal_navigators") {
    return `<div><b>Цель маршрута:</b> ${escapeHtml(feature.props.purpose || "-")}</div>`;
  }
  if (feature.layerId === "best_place") {
    return `<div><b>Сенсорная модальность:</b> ${escapeHtml(feature.props.modality || "-")}</div>`;
  }
  if (feature.layerId === "infrastructure_feedback") {
    return `<div><b>Категория:</b> ${escapeHtml(feature.props.infraCategory || "-")}</div>`;
  }
  if (feature.layerId === "hidden_treasures") {
    return `<div><b>Метка:</b> ${escapeHtml(feature.props.secretTag || "Секрет")}</div>`;
  }
  return "";
}

function wirePopupHandlers(featureId) {
  const reviewForm = document.getElementById(`review-form-${featureId}`);
  const saveBtn = document.getElementById(`save-item-${featureId}`);

  if (reviewForm) {
    reviewForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.currentUserId) return;

      const fd = new FormData(reviewForm);
      const feature = state.features.find((f) => f.id === featureId);
      const author = state.users.find((u) => u.id === state.currentUserId);
      if (!feature || !author) return;

      feature.reviews.push({
        rating: Number(fd.get("rating")),
        comment: text(fd.get("comment")),
        authorId: author.id,
        authorEmail: author.email,
        createdAt: new Date().toISOString(),
      });

      persist(STORAGE_KEYS.features, state.features);
      rerenderFeature(featureId);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (!state.currentUserId) return;
      const user = state.users.find((u) => u.id === state.currentUserId);
      if (!user) return;

      user.saved = user.saved || [];
      if (!user.saved.includes(featureId)) user.saved.push(featureId);

      persist(STORAGE_KEYS.users, state.users);
      renderSavedItems();
      alert("Объект сохранен в ваш профиль.");
    });
  }
}

function renderSavedItems() {
  const user = state.users.find((u) => u.id === state.currentUserId);
  if (!user) {
    el.savedItems.innerHTML = '<div class="small">Войдите, чтобы видеть сохраненные места.</div>';
    return;
  }

  const saved = (user.saved || [])
    .map((id) => state.features.find((f) => f.id === id))
    .filter(Boolean);

  if (!saved.length) {
    el.savedItems.innerHTML = '<div class="small">Сохраненных объектов пока нет.</div>';
    return;
  }

  el.savedItems.innerHTML = saved
    .map(
      (f) =>
        `<div class="saved-item"><b>${escapeHtml(f.title)}</b><div class="small">${escapeHtml(layerName(f.layerId))}</div></div>`
    )
    .join("");
}

function handleRegister(event) {
  event.preventDefault();
  const email = text(document.getElementById("reg-email").value).toLowerCase();
  const password = text(document.getElementById("reg-password").value);

  if (!email || !password) return;
  if (state.users.some((u) => u.email === email)) {
    alert("Пользователь с таким e-mail уже существует.");
    return;
  }

  const user = { id: crypto.randomUUID(), email, password, saved: [] };
  state.users.push(user);
  persist(STORAGE_KEYS.users, state.users);

  state.currentUserId = user.id;
  persist(STORAGE_KEYS.session, user.id);

  el.registerForm.reset();
  renderAuth();
  renderSavedItems();
}

function handleLogin(event) {
  event.preventDefault();
  const email = text(document.getElementById("login-email").value).toLowerCase();
  const password = text(document.getElementById("login-password").value);

  const user = state.users.find((u) => u.email === email && u.password === password);
  if (!user) {
    alert("Неверный e-mail или пароль.");
    return;
  }

  state.currentUserId = user.id;
  persist(STORAGE_KEYS.session, user.id);

  el.loginForm.reset();
  renderAuth();
  renderSavedItems();
}

function handleLogout() {
  state.currentUserId = null;
  persist(STORAGE_KEYS.session, null);
  renderAuth();
  renderSavedItems();
}

function renderAuth() {
  const user = state.users.find((u) => u.id === state.currentUserId);
  if (user) {
    el.authState.innerHTML = `<div>Вы вошли как <b>${escapeHtml(user.email)}</b></div>`;
    el.registerForm.classList.add("hidden");
    el.loginForm.classList.add("hidden");
    el.registerForm.style.display = "none";
    el.loginForm.style.display = "none";
    el.logoutBtn.classList.remove("hidden");
  } else {
    el.authState.innerHTML = '<div class="small">Войдите или зарегистрируйтесь для добавления и модерации данных.</div>';
    el.registerForm.classList.remove("hidden");
    el.loginForm.classList.remove("hidden");
    el.registerForm.style.display = "grid";
    el.loginForm.style.display = "grid";
    el.logoutBtn.classList.add("hidden");
  }
}

function averageRating(reviews) {
  if (!reviews?.length) return "нет";
  const avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
  return avg.toFixed(1);
}

function layerName(id) {
  return LAYERS.find((l) => l.id === id)?.name || id;
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function text(value) {
  return (value || "").toString().trim();
}

function escapeHtml(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function filesToDataUrls(files) {
  const validFiles = files.filter((f) => f instanceof File && f.size > 0);
  if (!validFiles.length) return [];

  const readers = validFiles.map(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
  );

  return Promise.all(readers);
}
