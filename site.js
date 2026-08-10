const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");

toggle?.addEventListener("click", () => {
  const light = root.classList.toggle("light");
  toggle.textContent = light ? "Dark Mode" : "Light Mode";
  toggle.setAttribute("aria-pressed", String(light));
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  });
}, { threshold: 0.14 });

document.querySelectorAll("section, .phone, .system-grid article, .flow article").forEach((item) => observer.observe(item));

document.querySelectorAll(".sweat-buttons button, .components button, .theme-toggle").forEach((button) => {
  button.addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pop = document.createElement("span");
    pop.className = "tap-pop";
    pop.style.left = `${rect.left + rect.width / 2}px`;
    pop.style.top = `${rect.top + rect.height / 2}px`;
    document.body.append(pop);
    window.setTimeout(() => pop.remove(), 620);
  });
});
