// ../context-hub-extensions/plugins/demo.counter/src/index.tsx
import { useState } from "react";
import { jsxs } from "react/jsx-runtime";
function Counter() {
  const [count, setCount] = useState(0);
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      "data-testid": "demo-counter",
      style: {
        border: "1px solid #d7dbe2",
        borderRadius: 9999,
        background: "#fff",
        color: "#1f2937",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 500,
        padding: "4px 12px"
      },
      onClick: () => setCount((value) => value + 1),
      children: [
        "count: ",
        count
      ]
    }
  );
}
function apply(ctx) {
  ctx.header.register({ id: "demo.counter", order: 50, Component: Counter });
}
export {
  apply
};
