(() => {
  const API_BASE = "http://127.0.0.1:8000";
  const PREDICT_URL = `${API_BASE}/predict`;

  const form = document.getElementById("predictForm");
  const submitBtn = document.getElementById("submitBtn");
  const formAlert = document.getElementById("formAlert");
  const apiNote = document.getElementById("apiNote");

  const resultEmpty = document.getElementById("resultEmpty");
  const resultContent = document.getElementById("resultContent");
  const dialFill = document.getElementById("dialFill");
  const needle = document.getElementById("needle");
  const dialValue = document.getElementById("dialValue");
  const resultLabel = document.getElementById("resultLabel");
  const resultBlurb = document.getElementById("resultBlurb");
  const resetBtn = document.getElementById("resetBtn");

  const ARC_LENGTH = 283; // matches stroke-dasharray on the dial path

  // Numeric fields need to be sent as numbers, not strings.
  const NUMERIC_FIELDS = {
    age: "int",
    avg_daily_usage_hours: "float",
    daily_unlocks: "int",
    study_hours: "float",
    physical_activity_hours: "float",
    sleep_hours_per_night: "float",
  };

  // ---------------------------------------------------------
  // Backend reachability check (cosmetic status line only)
  // ---------------------------------------------------------
  async function checkBackend() {
    try {
      const res = await fetch(`${API_BASE}/`, { method: "GET" });
      if (res.ok) {
        apiNote.textContent = `Connected to ${API_BASE}`;
        apiNote.classList.remove("offline");
      } else {
        throw new Error("Non-OK response");
      }
    } catch (err) {
      apiNote.innerHTML = `Can't reach <code>${API_BASE}</code> — is <code>uvicorn main:app --reload</code> running?`;
      apiNote.classList.add("offline");
    }
  }
  checkBackend();

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  function clearFieldErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
    form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  }

  function setFieldError(name, message) {
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    const fieldEl = errorEl ? errorEl.closest(".field") : null;
    if (errorEl) errorEl.textContent = message;
    if (fieldEl) fieldEl.classList.add("invalid");
  }

  function showAlert(message) {
    formAlert.textContent = message;
    formAlert.hidden = false;
  }

  function hideAlert() {
    formAlert.hidden = true;
    formAlert.textContent = "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("loading", isLoading);
  }

  function buildPayload(formData) {
    const payload = {};
    for (const [key, rawValue] of formData.entries()) {
      if (NUMERIC_FIELDS[key] === "int") {
        payload[key] = parseInt(rawValue, 10);
      } else if (NUMERIC_FIELDS[key] === "float") {
        payload[key] = parseFloat(rawValue);
      } else {
        payload[key] = rawValue;
      }
    }
    return payload;
  }

  function validateClientSide(payload) {
    const errors = [];
    if (Number.isNaN(payload.age) || payload.age < 10 || payload.age > 100) {
      errors.push(["age", "Enter an age between 10 and 100."]);
    }
    ["avg_daily_usage_hours", "study_hours", "physical_activity_hours", "sleep_hours_per_night"].forEach((key) => {
      if (Number.isNaN(payload[key]) || payload[key] < 0 || payload[key] > 24) {
        errors.push([key, "Enter a value between 0 and 24."]);
      }
    });
    if (Number.isNaN(payload.daily_unlocks) || payload.daily_unlocks < 0) {
      errors.push(["daily_unlocks", "Enter a value of 0 or more."]);
    }
    if (!payload.country || !payload.country.trim()) {
      errors.push(["country", "Country is required."]);
    }
    return errors;
  }

  // Map FastAPI/Pydantic 422 error shape -> field messages
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let applied = false;
    detail.forEach((err) => {
      const field = err.loc && err.loc[err.loc.length - 1];
      if (field) {
        setFieldError(field, err.msg || "Invalid value.");
        applied = true;
      }
    });
    return applied;
  }

  // ---------------------------------------------------------
  // Result rendering
  // ---------------------------------------------------------
  function describeScore(score) {
    if (score >= 7.5) {
      return {
        label: "Steady and balanced",
        blurb: "Your habits point to a healthy rhythm between screen time, rest, and recovery.",
      };
    }
    if (score >= 5) {
      return {
        label: "Holding, with room to breathe",
        blurb: "Things are broadly manageable, but a few adjustments could ease the load.",
      };
    }
    if (score >= 2.5) {
      return {
        label: "Under strain",
        blurb: "Your usage and lifestyle patterns suggest meaningful stress. Small changes to sleep or screen time may help.",
      };
    }
    return {
      label: "Significant strain",
      blurb: "These signals suggest real strain. Consider talking to someone you trust or a counselor.",
    };
  }

  function renderResult(score) {
    resultEmpty.hidden = true;
    resultContent.hidden = false;

    // Assume the model's score sits on a 0–10 scale; clamp defensively
    // in case the underlying training target uses a different range.
    const clamped = Math.max(0, Math.min(10, score));
    const fraction = clamped / 10;

    const offset = ARC_LENGTH - fraction * ARC_LENGTH;
    // Force reflow so the transition always fires from the previous state
    dialFill.style.transition = "none";
    dialFill.style.strokeDashoffset = ARC_LENGTH;
    needle.style.transition = "none";
    needle.style.transform = "rotate(-90deg)";
    // eslint-disable-next-line no-unused-expressions
    dialFill.getBoundingClientRect();

    requestAnimationFrame(() => {
      dialFill.style.transition = "";
      dialFill.style.strokeDashoffset = String(offset);
      needle.style.transition = "";
      needle.style.transform = `rotate(${-90 + fraction * 180}deg)`;
    });

    dialValue.textContent = score.toFixed(2);
    const { label, blurb } = describeScore(clamped);
    resultLabel.textContent = label;
    resultBlurb.textContent = blurb;

    resultContent.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function resetResult() {
    resultContent.hidden = true;
    resultEmpty.hidden = false;
  }

  resetBtn.addEventListener("click", resetResult);

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();
    clearFieldErrors();

    if (!form.reportValidity()) return;

    const payload = buildPayload(new FormData(form));
    const clientErrors = validateClientSide(payload);
    if (clientErrors.length) {
      clientErrors.forEach(([field, msg]) => setFieldError(field, msg));
      showAlert("Please fix the highlighted fields before submitting.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 422) {
        const body = await response.json().catch(() => null);
        const applied = body && applyServerValidationErrors(body.detail);
        showAlert(
          applied
            ? "The server rejected some values — see the highlighted fields."
            : "The server rejected this submission. Please review your inputs."
        );
        return;
      }

      if (!response.ok) {
        let detailMsg = `Request failed with status ${response.status}.`;
        try {
          const body = await response.json();
          if (body && body.detail) detailMsg = String(body.detail);
        } catch (_) {
          /* response wasn't JSON — keep default message */
        }
        showAlert(detailMsg);
        return;
      }

      const data = await response.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        showAlert("The server responded, but the prediction was missing from the result.");
        return;
      }
      renderResult(data.predicted_mental_health_score);
    } catch (err) {
      showAlert(
        `Couldn't reach the API at ${API_BASE}. Make sure the FastAPI server is running (uvicorn main:app --reload) and CORS is enabled.`
      );
    } finally {
      setLoading(false);
    }
  });
})();
