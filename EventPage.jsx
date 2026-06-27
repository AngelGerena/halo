:root {
  --ink: #1C2640;
  --gold: #C5A44B;
  --bg: #F2ECE4;
  --second: #6B8CAE;
  --text: #3A3530;
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Manrope', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.serif { font-family: 'Cormorant Garamond', Georgia, serif; }

a { color: inherit; }

button {
  cursor: pointer;
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  border: none;
  transition: transform .12s ease, opacity .12s ease, background .12s ease;
}
button:hover { transform: translateY(-1px); }
button:active { transform: translateY(0); }
button:focus-visible { outline: 3px solid var(--second); outline-offset: 2px; }

input, select {
  font-family: 'Manrope', sans-serif;
  font-size: 15px;
}
input:focus-visible, select:focus-visible {
  outline: 3px solid var(--second);
  outline-offset: 1px;
}

.card { transition: transform .18s ease, box-shadow .18s ease; }
.card:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(28,38,64,.18); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  *, button:hover, .card:hover { transition: none !important; animation: none !important; transform: none !important; }
}

.wrap { max-width: 1040px; margin: 0 auto; padding: 28px 20px 60px; }
