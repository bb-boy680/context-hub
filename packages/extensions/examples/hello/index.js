/**
 * A hand-written plugin. It imports nothing: React, the icon table, the i18n
 * service, and the UI kit all arrive through the kernel, so one copy of React
 * runs in the page and Tailwind classes never have to be compiled for it.
 */
export function apply(ctx) {
  const { react, ui, i18n } = ctx
  const { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } = ui
  const h = react.createElement

  /* Taken now: a fiber's injected services resolve during activation, not later. */
  const t = (key, fallback) => {
    const translated = i18n.t(key)
    return translated === key ? fallback : translated
  }

  function HelloPage() {
    const [count, setCount] = react.useState(0)
    return h(
      "div",
      { className: "flex flex-col gap-6" },
      h(
        Card,
        null,
        h(
          CardHeader,
          null,
          h(CardTitle, null, t("hello.title", "Hello from a plugin")),
          h(
            CardDescription,
            null,
            t(
              "hello.description",
              "This page is served by a folder on disk, not by the app's own source."
            )
          )
        ),
        h(
          CardContent,
          { className: "flex flex-col items-start gap-4" },
          h(
            "div",
            { className: "flex items-center gap-2 text-sm" },
            h(Badge, { variant: "secondary" }, `locale: ${i18n.state.active}`),
            h(Badge, { variant: "secondary" }, "api ^0.1")
          ),
          h(Button, { onClick: () => setCount(count + 1) }, `${t("hello.action", "Clicked")} ${count}`)
        )
      )
    )
  }

  ctx.locales.register({
    id: "en",
    messages: {
      "nav.hello": "Hello Plugin",
      "hello.title": "Hello from a plugin",
      "hello.description":
        "This page is served by a folder on disk, not by the app's own source.",
      "hello.action": "Clicked",
    },
  })
  ctx.locales.register({
    id: "zh-CN",
    messages: {
      "nav.hello": "示例插件",
      "hello.title": "来自插件的问候",
      "hello.description": "这个页面由磁盘上的文件夹提供，而不是应用自身的源码。",
      "hello.action": "点击次数",
    },
  })
  ctx.nav.register({
    path: "/hello",
    labelKey: "nav.hello",
    icon: ctx.icons.sparkles,
    group: "operate",
    order: 15,
  })
  ctx.routes.register({ path: "/hello", Component: HelloPage })
}
