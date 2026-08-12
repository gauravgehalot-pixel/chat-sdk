# Data Insight dashboards

`@opsrabbit/chat` 0.2 adds a read-only, headless interface for Data Insight dashboards and saved semantic queries published to an Embedded Chat preset.

The matching OpsRabbit host advertises `chat_api_version: "2"` and `capabilities.insights: true`. Applications that may connect to older hosts should call `getConfiguration()` and hide their Insights UI when that capability is false.

List operations return the most recently updated resources first, accept a `limit` from 1 to 100, and return at most 100 items. Version 0.2 does not offer continuation cursors; use a dedicated preset with no more than 100 published dashboards and 100 published saved queries when complete SDK discovery is required.

## Load and render

```ts
const page = await chat.insights.dashboards.list({ limit: 20 });
const definition = await chat.insights.dashboards.get(page.dashboards[0].id);
const rendered = await chat.insights.dashboards.render(definition.id, { range: "30d" });

for (const item of rendered.widgets) {
  if (!item.ok) console.warn(item.widget.title, item.error);
  else console.log(item.widget.type, item.result);
}
```

Run a published saved query directly when a custom page does not need a dashboard layout:

```ts
const queries = await chat.insights.queries.list();
const { query, result } = await chat.insights.queries.run(queries.queries[0].id);
```

## Recommended visualization library

The OpsRabbit web application uses [Apache ECharts](https://echarts.apache.org/) 6 and its SVG renderer for Data Insight charts. ECharts is the recommended option when an integrating frontend wants similar responsive line, area, bar, pie, donut, and scatter visualizations.

ECharts is deliberately not bundled with `@opsrabbit/chat`. Install it in the application:

```bash
npm install echarts
```

A minimal adapter can interpret the dashboard widget configuration and result rows:

```ts
import * as echarts from "echarts";

const item = rendered.widgets.find((candidate) => candidate.ok && candidate.widget.type === "bar");
if (item) {
  const result = item.result as { columns?: string[]; rows?: Array<Record<string, unknown>> };
  const [categoryKey, valueKey] = result.columns ?? [];
  const rows = result.rows ?? [];
  const chart = echarts.init(document.querySelector("#chart")!, undefined, { renderer: "svg" });
  chart.setOption({
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((row) => row[categoryKey]) },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: rows.map((row) => row[valueKey]) }],
  });
}
```

Production adapters should validate column names, handle empty/error results, format values by unit, dispose chart instances, and resize them with their containers. The widget `config` and `position` objects are presentation hints rather than executable code; never evaluate their contents.

OpsRabbit rejects provider results that exceed the public row, column, nesting, string, object-key, node-count, or cumulative 512 KiB render budget. It does not silently truncate analytics data.

## Security and ownership

- The customer's backend continues to mint the same short-lived RS256 token used for chat.
- OpsRabbit authorizes every list, detail, query run, and dashboard render against current tenant state and resource grants.
- Dashboard renders use a separate, stricter rate bucket because one render can execute multiple query-backed widgets.
- A dashboard render independently checks every saved query used by its widgets.
- A missing read grant is intentionally indistinguishable from a missing resource.
- The SDK does not persist definitions or results. If the integrating application caches or exports them, that application owns the resulting authorization, retention, and deletion obligations.
- SDK access is read-only. Service principals cannot create, update, delete, or become owners of saved queries and dashboards through this API.
