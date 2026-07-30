import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Without this, any error thrown while rendering (anywhere in the app)
// leaves the screen completely blank with nothing to go on. This catches
// that, shows what actually happened, and offers a reload — much easier to
// diagnose and recover from than a silent blank screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("CareTrack crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 480, margin: "40px auto",
          background: "#fff", border: "1px solid #E6DFD1", borderRadius: 12, color: "#233937",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13.5, color: "#63706F", marginBottom: 16, lineHeight: 1.6 }}>
            This screen hit an error and couldn't load. Reloading usually fixes it — if it keeps happening, the
            details below are worth sharing so it can be fixed.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#1E5C57", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}
          >
            Reload
          </button>
          <details style={{ fontSize: 12, color: "#63706F", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
            <summary style={{ cursor: "pointer", marginBottom: 8 }}>Technical details</summary>
            {String((this.state.error && this.state.error.stack) || this.state.error)}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
