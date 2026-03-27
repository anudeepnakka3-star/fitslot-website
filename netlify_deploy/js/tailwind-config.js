const tailwindConfig = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "on-primary-container": "#eeefff",
          "on-error": "#ffffff",
          "on-error-container": "#93000a",
          "background": "#f9f9fa",
          "tertiary": "#943700",
          "primary-fixed-dim": "#b4c5ff",
          "surface": "#f9f9fa",
          "surface-container": "#eeeeef",
          "secondary-container": "#dce2f3",
          "on-tertiary": "#ffffff",
          "primary-fixed": "#dbe1ff",
          "on-surface-variant": "#434655",
          "tertiary-fixed": "#ffdbcd",
          "surface-container-lowest": "#ffffff",
          "outline": "#737686",
          "on-primary": "#ffffff",
          "surface-tint": "#0053db",
          "tertiary-fixed-dim": "#ffb596",
          "on-tertiary-fixed-variant": "#7d2d00",
          "primary": "#004ac6",
          "secondary": "#585f6c",
          "secondary-fixed": "#dce2f3",
          "secondary-fixed-dim": "#c0c7d6",
          "inverse-primary": "#b4c5ff",
          "inverse-on-surface": "#f0f1f2",
          "surface-container-low": "#f3f3f4",
          "on-tertiary-fixed": "#360f00",
          "outline-variant": "#c3c6d7",
          "on-primary-fixed-variant": "#003ea8",
          "on-secondary": "#ffffff",
          "on-secondary-container": "#5e6572",
          "surface-variant": "#e2e2e3",
          "on-primary-fixed": "#00174b",
          "surface-bright": "#f9f9fa",
          "inverse-surface": "#2f3132",
          "error-container": "#ffdad6",
          "error": "#ba1a1a",
          "on-secondary-fixed": "#151c27",
          "on-secondary-fixed-variant": "#404754",
          "surface-container-high": "#e8e8e9",
          "surface-container-highest": "#e2e2e3",
          "on-tertiary-container": "#ffede6",
          "surface-dim": "#dadadb",
          "tertiary-container": "#bc4800",
          "primary-container": "#2563eb",
          "on-surface": "#1a1c1d",
          "on-background": "#1a1c1d"
        },
        fontFamily: {
          "headline": ["Inter", "sans-serif"],
          "body": ["Inter", "sans-serif"],
          "label": ["Inter", "sans-serif"]
        },
        borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "1rem", "full": "9999px"},
      },
    },
  };

  // Attach to window if tailwind is loaded
  if (window.tailwind) {
    window.tailwind.config = tailwindConfig;
  }
