(() => {
  "use strict";

  const COMPANION_KEY = "type2learn-companion";
  const SETTINGS_KEY = "type2learn-companion-settings";
  const NEXT_MESSAGE_KEY = "type2learn-companion-next-message";
  const MESSAGE_HISTORY_KEY = "type2learn-companion-message-history";

  const messages = {
    homepage: ["Welcome to Type2Learn.", "Welcome. One clear step is enough to begin."],
    "learn-home": ["Welcome back. Your learning space is ready.", "Start small. Keep the next action clear."],
    "course-start": ["Great start. Take one small step at a time.", "You are ready to begin."],
    "lesson-completed": ["Well done. Your progress is saved.", "Nice work. Return when you are ready."],
    "home-return": ["Welcome back. Your progress is still here.", "Welcome back. The next step is ready."]
  };

  const companions = [
    { id: "t2", name: "Type2 guide", mark: "T2" },
    { id: "loop", name: "Learning loop", mark: "LO" },
    { id: "calm", name: "Calm helper", mark: "CH" },
    { id: "focus", name: "Focus guide", mark: "FG" }
  ];

  const defaultSettings = { enabled: true, easyReading: false, voiceEnabled: false };

  const read = (key, fallback) => {
    try {
      return window.localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  };

  const getCompanion = () => companions.find((companion) => companion.id === read(COMPANION_KEY, "t2")) || companions[0];

  const getSettings = () => {
    try {
      return { ...defaultSettings, ...JSON.parse(read(SETTINGS_KEY, "{}")) };
    } catch (_) {
      return { ...defaultSettings };
    }
  };

  const saveSettings = (settings) => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {
      /* Settings remain available for this visit. */
    }
  };

  const chooseMessage = (eventName) => {
    const choices = messages[eventName];
    if (!choices) return null;
    try {
      const history = JSON.parse(window.sessionStorage.getItem(MESSAGE_HISTORY_KEY) || "{}");
      const used = Array.isArray(history[eventName]) ? history[eventName] : [];
      const available = choices.map((_, index) => index).filter((index) => !used.includes(index));
      const index = (available.length ? available : choices.map((_, choiceIndex) => choiceIndex))[0];
      history[eventName] = available.length > 1 ? [...used, index] : [index];
      window.sessionStorage.setItem(MESSAGE_HISTORY_KEY, JSON.stringify(history));
      return choices[index];
    } catch (_) {
      return choices[0];
    }
  };

  const takeStoredMessage = () => {
    try {
      const eventName = window.sessionStorage.getItem(NEXT_MESSAGE_KEY);
      window.sessionStorage.removeItem(NEXT_MESSAGE_KEY);
      return eventName;
    } catch (_) {
      return null;
    }
  };

  const stopSpeech = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const startMascot = () => {
    if (document.getElementById("type2learn-mascot")) return;

    const mascot = document.createElement("aside");
    mascot.id = "type2learn-mascot";
    mascot.className = "type2learn-mascot";
    mascot.setAttribute("aria-label", "Type2Learn companion");
    mascot.innerHTML = [
      '<p class="mascot-welcome" id="mascot-welcome"></p>',
      '<button class="mascot-settings-button" type="button" aria-expanded="false" aria-controls="mascot-settings" aria-label="Companion settings">&#9881;</button>',
      '<button class="mascot-trigger" type="button" aria-expanded="false" aria-controls="mascot-selector" aria-describedby="mascot-welcome"><span class="mascot-illustration" aria-hidden="true"></span><span class="sr-only">Choose the Type2Learn companion</span></button>',
      '<div class="mascot-selector" id="mascot-selector" hidden><p class="mascot-selector-title">Choose a companion</p><div class="mascot-options" role="group" aria-label="Companion choices"></div></div>',
      '<section class="mascot-settings" id="mascot-settings" aria-label="Companion settings" hidden><p class="mascot-selector-title">Companion settings</p><label class="mascot-setting"><span>Enable companion</span><input type="checkbox" data-mascot-enabled role="switch"></label><label class="mascot-setting"><span>Easy reading font<br><small>Use a dyslexia-friendly fallback when available.</small></span><input type="checkbox" data-mascot-easy-reading role="switch"></label><label class="mascot-setting"><span>Voice on hover<br><small>Off by default.</small></span><input type="checkbox" data-mascot-voice role="switch"></label></section>'
    ].join("");
    document.body.append(mascot);

    const trigger = mascot.querySelector(".mascot-trigger");
    const selector = mascot.querySelector(".mascot-selector");
    const settingsButton = mascot.querySelector(".mascot-settings-button");
    const settingsPanel = mascot.querySelector(".mascot-settings");
    const enabledControl = mascot.querySelector("[data-mascot-enabled]");
    const easyReadingControl = mascot.querySelector("[data-mascot-easy-reading]");
    const voiceControl = mascot.querySelector("[data-mascot-voice]");
    const welcome = mascot.querySelector(".mascot-welcome");
    const illustration = mascot.querySelector(".mascot-illustration");
    const options = mascot.querySelector(".mascot-options");
    let selected = getCompanion();
    let settings = getSettings();
    let currentMessage = "";

    const setMessage = (eventName) => {
      const message = chooseMessage(eventName);
      if (!message) return;
      currentMessage = message;
      welcome.textContent = currentMessage;
    };

    const closePanels = () => {
      const wasOpen = !selector.hidden || !settingsPanel.hidden;
      selector.hidden = true;
      settingsPanel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      settingsButton.setAttribute("aria-expanded", "false");
      if (wasOpen) stopSpeech();
    };

    const applySettings = () => {
      mascot.classList.toggle("is-disabled", !settings.enabled);
      document.documentElement.classList.toggle("companion-easy-reading", settings.easyReading);
      enabledControl.checked = settings.enabled;
      easyReadingControl.checked = settings.easyReading;
      voiceControl.checked = settings.voiceEnabled;
      enabledControl.setAttribute("aria-checked", String(settings.enabled));
      easyReadingControl.setAttribute("aria-checked", String(settings.easyReading));
      voiceControl.setAttribute("aria-checked", String(settings.voiceEnabled));
      saveSettings(settings);
    };

    const speakWelcome = () => {
      if (!settings.enabled || !settings.voiceEnabled || !("speechSynthesis" in window) || !currentMessage) return;
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
      const utterance = new SpeechSynthesisUtterance(currentMessage);
      utterance.rate = 1.03;
      window.speechSynthesis.speak(utterance);
    };

    const render = () => {
      illustration.dataset.mark = selected.mark;
      illustration.setAttribute("aria-label", selected.name);
      trigger.setAttribute("aria-label", "Choose the Type2Learn companion. Current choice: " + selected.name);
      options.replaceChildren(...companions.map((companion) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "mascot-option";
        option.setAttribute("aria-pressed", String(companion.id === selected.id));
        option.innerHTML = '<span aria-hidden="true">' + companion.mark + '</span><span>' + companion.name + '</span>';
        option.addEventListener("click", () => {
          selected = companion;
          try {
            window.localStorage.setItem(COMPANION_KEY, selected.id);
          } catch (_) {
            /* Preference remains for this visit. */
          }
          render();
          closePanels();
          trigger.focus();
        });
        return option;
      }));
    };

    trigger.addEventListener("mouseenter", speakWelcome);
    trigger.addEventListener("click", () => {
      stopSpeech();
      settingsPanel.hidden = true;
      settingsButton.setAttribute("aria-expanded", "false");
      selector.hidden = !selector.hidden;
      trigger.setAttribute("aria-expanded", String(!selector.hidden));
    });
    settingsButton.addEventListener("click", () => {
      stopSpeech();
      selector.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      settingsPanel.hidden = !settingsPanel.hidden;
      settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
    });
    enabledControl.addEventListener("change", () => {
      settings.enabled = enabledControl.checked;
      closePanels();
      applySettings();
    });
    easyReadingControl.addEventListener("change", () => {
      settings.easyReading = easyReadingControl.checked;
      applySettings();
    });
    voiceControl.addEventListener("change", () => {
      settings.voiceEnabled = voiceControl.checked;
      applySettings();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!mascot.contains(event.target)) closePanels();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && (!selector.hidden || !settingsPanel.hidden)) {
        closePanels();
        trigger.focus();
      }
    });
    window.addEventListener("type2learn:companion-message", (event) => setMessage(event.detail?.event));
    window.addEventListener("pagehide", stopSpeech, { once: true });

    render();
    applySettings();
    const storedMessage = takeStoredMessage();
    if (storedMessage) setMessage(storedMessage);
    else if (window.location.pathname.startsWith("/learn/") || window.location.pathname.startsWith("/afterlogin/")) setMessage("learn-home");
    else setMessage("homepage");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startMascot, { once: true });
  else startMascot();
})();
