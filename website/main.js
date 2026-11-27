import "./styles.css";

const repository = import.meta.env.VITE_GITHUB_REPOSITORY ?? "";
const validRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
const releaseNote = document.querySelector("#release-note");
const releaseAssets = {
  "win-x64": "NexRoute-win-x64.exe",
  "mac-arm64": "NexRoute-mac-arm64.dmg",
  "mac-x64": "NexRoute-mac-x64.dmg",
  "linux-x64": "NexRoute-linux-x86_64.AppImage",
};

if (validRepository) {
  for (const link of document.querySelectorAll("[data-download]")) {
    const asset = releaseAssets[link.dataset.download];
    if (!asset) continue;

    link.href = `https://github.com/${repository}/releases/latest/download/${asset}`;
    link.textContent = `Download ${link.dataset.downloadLabel}`;
    link.setAttribute("aria-label", `Download NexRoute for ${link.dataset.downloadLabel}`);
    link.removeAttribute("aria-disabled");
  }
  releaseNote.textContent =
    "Downloads open the latest published installer from GitHub Releases. macOS builds may show Gatekeeper warnings if they are not signed.";
}

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#site-nav");

menuButton.addEventListener("click", () => {
  const isExpanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isExpanded));
  navigation.classList.toggle("is-open", !isExpanded);
});

navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  }
});

document.querySelectorAll('[aria-disabled="true"]').forEach((link) => {
  link.addEventListener("click", (event) => event.preventDefault());
});

const scene = document.querySelector("[data-route-scene]");
const sceneTitle = document.querySelector("[data-scene-title]");
const sceneDescription = document.querySelector("[data-scene-description]");
const sceneIndex = document.querySelector("[data-scene-index]");
const sceneSteps = [...document.querySelectorAll("[data-scene-step]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const routeMotion = document.querySelector("[data-route-motion]");

sceneSteps.forEach((step, index) => {
  step.addEventListener("click", () => {
    sceneSteps.forEach((item) => {
      const active = item === step;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    sceneTitle.textContent = step.dataset.title;
    sceneDescription.textContent = step.dataset.description;
    sceneIndex.textContent = `${String(index + 1).padStart(2, "0")} / ${String(sceneSteps.length).padStart(2, "0")}`;
  });
});

if (!reducedMotion.matches) {
  routeMotion?.beginElement();
  scene.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const bounds = scene.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    scene.style.setProperty("--tilt-x", `${vertical * -7}deg`);
    scene.style.setProperty("--tilt-y", `${horizontal * 9}deg`);
  });
  scene.addEventListener("pointerleave", () => {
    scene.style.setProperty("--tilt-x", "0deg");
    scene.style.setProperty("--tilt-y", "0deg");
  });
}
