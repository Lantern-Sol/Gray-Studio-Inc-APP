import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const logs = await db.podOrderLog.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    logs: logs.map((log) => ({
      id: log.id,
      orderName: log.orderName ?? log.orderId,
      scene: log.scene ?? "—",
      variantId: log.variantId ?? "—",
      quantity: log.quantity,
      status: log.status,
      podOrderId: log.podOrderId ?? "—",
      errorMessage: log.errorMessage,
      printFileUrl: log.printFileUrl,
      createdAt: new Date(log.createdAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    })),
  };
};

const STATUS_TONE = {
  submitted: "success",
  error: "critical",
  skipped_no_preview: "warning",
};

export default function Orders() {
  const { logs } = useLoaderData();

  return (
    <s-page heading="Portrait orders">
      <s-section heading="POD handoff log">
        <s-paragraph>
          Every paid order containing a portrait shows up here with the result of the
          print-on-demand handoff. Newest first (last 100).
        </s-paragraph>

        {logs.length === 0 ? (
          <s-paragraph>
            No portrait orders yet. Once a customer pays for an order that includes a
            portrait frame, it appears here automatically.
          </s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e1e3e5" }}>
                <th style={{ padding: "8px" }}>Date</th>
                <th style={{ padding: "8px" }}>Order</th>
                <th style={{ padding: "8px" }}>Scene</th>
                <th style={{ padding: "8px" }}>Variant</th>
                <th style={{ padding: "8px" }}>Qty</th>
                <th style={{ padding: "8px" }}>Status</th>
                <th style={{ padding: "8px" }}>POD order</th>
                <th style={{ padding: "8px" }}>Print file</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{log.createdAt}</td>
                  <td style={{ padding: "8px" }}>{log.orderName}</td>
                  <td style={{ padding: "8px" }}>{log.scene}</td>
                  <td style={{ padding: "8px" }}>{log.variantId}</td>
                  <td style={{ padding: "8px" }}>{log.quantity}</td>
                  <td style={{ padding: "8px" }}>
                    <s-badge tone={STATUS_TONE[log.status] ?? "info"}>{log.status}</s-badge>
                    {log.errorMessage ? (
                      <div style={{ color: "#8e1f0b", marginTop: "4px", maxWidth: "260px" }}>
                        {log.errorMessage}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "8px" }}>{log.podOrderId}</td>
                  <td style={{ padding: "8px" }}>
                    {log.printFileUrl ? (
                      <a href={log.printFileUrl} target="_blank" rel="noreferrer">
                        open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
