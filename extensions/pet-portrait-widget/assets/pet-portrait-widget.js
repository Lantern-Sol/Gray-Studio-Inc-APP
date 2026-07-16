(function () {
  "use strict";

  function initWidget(root) {
    const proxyPath = root.dataset.proxyPath;
    const sceneIds = (root.dataset.sceneIds || "").split(",").map((s) => s.trim()).filter(Boolean);
    const sceneLabels = (root.dataset.sceneLabels || "").split(",").map((s) => s.trim()).filter(Boolean);

    const scenesEl = root.querySelector("[data-pp-scenes]");
    const fileInput = root.querySelector("[data-pp-file-input]");
    const fileHint = root.querySelector("[data-pp-file-hint]");
    const uploadPreviewEl = root.querySelector("[data-pp-upload-preview]");
    const generateBtn = root.querySelector("[data-pp-generate-btn]");
    const previewGridEl = root.querySelector("[data-pp-preview-grid]");
    const framesEl = root.querySelector("[data-pp-frames]");
    const addToCartBtn = root.querySelector("[data-pp-add-to-cart-btn]");
    const errorEl = root.querySelector("[data-pp-error]");
    const frameDataEl = root.querySelector("[data-pp-frame-data]");

    let frames = [];
    try {
      frames = JSON.parse(frameDataEl?.textContent || "[]");
    } catch (e) {
      frames = [];
    }

    const state = {
      scene: null,
      photoFile: null,
      jobId: null,
      previews: [],
      selectedPreviewId: null,
      selectedVariantId: null,
    };

    function showStep(name) {
      root.querySelectorAll("[data-pp-step]").forEach((stepEl) => {
        stepEl.hidden = stepEl.dataset.ppStep !== name;
      });
    }

    function showError(message, detail) {
      errorEl.textContent = message;
      if (detail) {
        const detailEl = document.createElement("div");
        detailEl.className = "pp-error-detail";
        detailEl.textContent = detail;
        errorEl.appendChild(detailEl);
      }
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    function renderScenes() {
      scenesEl.innerHTML = "";
      sceneIds.forEach((id, index) => {
        const label = sceneLabels[index] || id;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pp-scene-btn";
        btn.textContent = label;
        btn.dataset.sceneId = id;
        btn.addEventListener("click", () => {
          state.scene = id;
          root.querySelectorAll(".pp-scene-btn").forEach((b) => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          showStep("upload");
        });
        scenesEl.appendChild(btn);
      });
    }

    function renderUploadPreview(file) {
      const reader = new FileReader();
      reader.onload = () => {
        uploadPreviewEl.innerHTML = `<img src="${reader.result}" alt="Your photo" class="pp-thumb">`;
      };
      reader.readAsDataURL(file);
    }

    function renderPreviews() {
      previewGridEl.innerHTML = "";
      state.previews.forEach((preview) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "pp-preview-card";
        card.innerHTML = `<img src="${preview.imageUrl}" alt="Portrait preview" class="pp-preview-img">`;
        card.addEventListener("click", () => {
          state.selectedPreviewId = preview.id;
          root.querySelectorAll(".pp-preview-card").forEach((c) => c.classList.remove("is-selected"));
          card.classList.add("is-selected");
          showStep("frame");
        });
        previewGridEl.appendChild(card);
      });
    }

    function renderFrames() {
      framesEl.innerHTML = "";
      if (!frames.length) {
        framesEl.innerHTML =
          "<p class=\"pp-empty\">No frame collection configured yet — set one in the theme editor.</p>";
        return;
      }
      frames.forEach((frame) => {
        const wrap = document.createElement("div");
        wrap.className = "pp-frame-card";
        const options = frame.variants
          .map((v) => `<option value="${v.id}" ${v.available ? "" : "disabled"}>${v.title} — $${v.price}</option>`)
          .join("");
        wrap.innerHTML = `
          <img src="${frame.image || ""}" alt="${frame.title}" class="pp-frame-img">
          <div class="pp-frame-title">${frame.title}</div>
          <select class="pp-frame-variant-select" data-frame-id="${frame.id}">
            <option value="">Choose size…</option>
            ${options}
          </select>
        `;
        const select = wrap.querySelector("select");
        select.addEventListener("change", () => {
          root.querySelectorAll(".pp-frame-variant-select").forEach((s) => {
            if (s !== select) s.value = "";
          });
          state.selectedVariantId = select.value || null;
          addToCartBtn.disabled = !state.selectedVariantId;
        });
        framesEl.appendChild(wrap);
      });
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      state.photoFile = file;
      fileHint.textContent = file.name;
      renderUploadPreview(file);
      generateBtn.disabled = false;
    });

    generateBtn.addEventListener("click", async () => {
      clearError();
      if (!state.scene || !state.photoFile) return;

      showStep("loading");

      const formData = new FormData();
      formData.append("scene", state.scene);
      formData.append("photo", state.photoFile);

      try {
        const res = await fetch(`${proxyPath}/generate`, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Generation request failed (${res.status})`);
        const data = await res.json();
        state.jobId = data.jobId;
        await pollStatus(data.jobId);
      } catch (err) {
        showStep("upload");
        showError("Something went wrong generating your preview. Please try again.", err && err.message);
        console.error("[pet-portrait-widget]", err);
      }
    });

    async function pollStatus(jobId) {
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(`${proxyPath}/status/${jobId}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        const data = await res.json();

        if (data.status === "ready") {
          state.previews = data.previews;
          renderPreviews();
          showStep("preview");
          return;
        }
        if (data.status === "error") {
          throw new Error(data.errorMessage || "Generation failed");
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("Timed out waiting for your preview");
    }

    addToCartBtn.addEventListener("click", async () => {
      clearError();
      if (!state.selectedVariantId || !state.selectedPreviewId) return;

      addToCartBtn.disabled = true;
      addToCartBtn.textContent = "Adding…";

      try {
        const res = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              {
                id: state.selectedVariantId,
                quantity: 1,
                properties: {
                  _pp_preview_id: state.selectedPreviewId,
                  _pp_job_id: state.jobId,
                  _pp_scene: state.scene,
                },
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`Add to cart failed (${res.status})`);
        window.location.href = "/cart";
      } catch (err) {
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = "Add to cart";
        showError("Couldn't add that to your cart. Please try again.", err && err.message);
        console.error("[pet-portrait-widget]", err);
      }
    });

    renderScenes();
    renderFrames();
  }

  document.querySelectorAll("[data-pp-widget]").forEach(initWidget);
})();
