import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { storage } from "../s3.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const order = await db.modelOrder.findUnique({
    where: { review_token: params.token },
    include: { ModelGenerations: true },
  });

  if (!order) {
    throw new Response("Not Found", { status: 404 });
  }

  if (order.order_status !== "AWAITING_CHOICE") {
    return {
      orderNumber: order.order_number,
      firstName: order.customer_first_name,
      status: order.order_status,
      models: [] as ModelEntry[],
      alreadySelected: order.order_status === "MODEL_SELECTED",
    };
  }

  const models: ModelEntry[] = await Promise.all(
    order.ModelGenerations.filter((g) => g.glbUrl).map(async (g) => ({
      id: g.id,
      glbUrl: await storage.getPresignedUrl(g.glbUrl!),
      selectedByCust: g.selectedByCust,
    })),
  );

  return {
    orderNumber: order.order_number,
    firstName: order.customer_first_name,
    status: order.order_status,
    models,
    alreadySelected: false,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const order = await db.modelOrder.findUnique({
    where: { review_token: params.token },
    include: { ModelGenerations: true },
  });

  if (!order) {
    throw new Response("Not Found", { status: 404 });
  }

  if (order.order_status !== "AWAITING_CHOICE") {
    return { error: "This order is no longer accepting a model selection." };
  }

  const formData = await request.formData();
  const selectedId = Number(formData.get("selectedModelId"));

  if (!selectedId || isNaN(selectedId)) {
    return { error: "Please select a model before confirming." };
  }

  const isValidModel = order.ModelGenerations.some((g) => g.id === selectedId);
  if (!isValidModel) {
    return { error: "Invalid model selection." };
  }

  await db.$transaction([
    // Clear any previous selection
    db.modelGenerations.updateMany({
      where: { modelOrderId: order.id },
      data: { selectedByCust: false },
    }),
    // Mark the chosen model
    db.modelGenerations.update({
      where: { id: selectedId },
      data: { selectedByCust: true },
    }),
    // Advance order status
    db.modelOrder.update({
      where: { id: order.id },
      data: { order_status: "MODEL_SELECTED" },
    }),
  ]);

  return { success: true, orderNumber: order.order_number };
};

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface ModelEntry {
  id: number;
  glbUrl: string;
  selectedByCust: boolean;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function CustomerReview() {
  const { orderNumber, firstName, status, models, alreadySelected } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (actionData && "success" in actionData && actionData.success) {
    return (
      <Page>
        <div style={styles.card}>
          <Checkmark />
          <h1 style={styles.heading}>Selection confirmed!</h1>
          <p style={styles.body}>
            Great choice! We&rsquo;ve locked in your selected model for order{" "}
            <strong>{actionData.orderNumber}</strong>. Our team will begin final
            production &mdash; we&rsquo;ll be in touch with shipping details
            soon.
          </p>
        </div>
      </Page>
    );
  }

  if (alreadySelected || status === "MODEL_SELECTED") {
    return (
      <Page>
        <div style={styles.card}>
          <h1 style={styles.heading}>Model already selected</h1>
          <p style={styles.body}>
            Your model selection for order <strong>{orderNumber}</strong> has
            already been confirmed and is in production. Thank you!
          </p>
        </div>
      </Page>
    );
  }

  if (models.length === 0) {
    return (
      <Page>
        <div style={styles.card}>
          <h1 style={styles.heading}>Models not ready yet</h1>
          <p style={styles.body}>
            Hi {firstName}, your 3D models for order{" "}
            <strong>{orderNumber}</strong> are still being generated. You&rsquo;ll
            receive an email as soon as they&rsquo;re ready to review.
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div style={styles.card}>
        <h1 style={styles.heading}>Choose your 3D model</h1>
        <p style={styles.body}>
          Hi {firstName}, your models for order <strong>{orderNumber}</strong>{" "}
          are ready! Rotate each model below, then select the one you&rsquo;d
          like us to produce.
        </p>

        <Form method="post">
          <div style={styles.modelGrid}>
            {models.map((model, index) => (
              <ModelCard
                key={model.id}
                model={model}
                label={`Model ${index + 1}`}
              />
            ))}
          </div>

          {actionData && "error" in actionData && (
            <p style={styles.error}>{actionData.error}</p>
          )}

          <button type="submit" style={styles.button}>
            Confirm selection
          </button>
        </Form>
      </div>

      {/* model-viewer web component */}
      <script
        type="module"
        src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"
      />
    </Page>
  );
}

function ModelCard({
  model,
  label,
}: {
  model: ModelEntry;
  label: string;
}) {
  return (
    <label style={styles.modelCard}>
      <input
        type="radio"
        name="selectedModelId"
        value={String(model.id)}
        defaultChecked={model.selectedByCust}
        style={styles.radioInput}
        required
      />
      {/* @ts-expect-error model-viewer is a custom element */}
      <model-viewer
        src={model.glbUrl}
        alt={label}
        camera-controls
        auto-rotate
        style={styles.viewer}
      />
      <span style={styles.modelLabel}>{label}</span>
    </label>
  );
}

/* ─── Layout helpers ─────────────────────────────────────────────────────── */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.brand}>Incahoots 3D</span>
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

function Checkmark() {
  return (
    <div style={styles.checkCircle}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f0",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1a1a1a",
  },
  header: {
    backgroundColor: "#1a1a1a",
    padding: "16px 32px",
  },
  brand: {
    color: "#fff",
    fontWeight: 700,
    fontSize: "18px",
    letterSpacing: "0.5px",
  },
  main: {
    maxWidth: "860px",
    margin: "48px auto",
    padding: "0 16px",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "8px",
    padding: "40px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "24px",
    fontWeight: 700,
  },
  body: {
    margin: "0 0 28px",
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#444",
  },
  modelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "20px",
    marginBottom: "28px",
  },
  modelCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    border: "2px solid #e8e8e0",
    borderRadius: "8px",
    padding: "16px",
    cursor: "pointer",
    gap: "12px",
  },
  radioInput: {
    width: "18px",
    height: "18px",
    accentColor: "#1a1a1a",
    cursor: "pointer",
  },
  viewer: {
    width: "100%",
    height: "260px",
    borderRadius: "4px",
    backgroundColor: "#f5f5f0",
  },
  modelLabel: {
    fontSize: "14px",
    fontWeight: 600,
  },
  error: {
    color: "#c0392b",
    fontSize: "14px",
    margin: "0 0 12px",
  },
  button: {
    display: "block",
    width: "100%",
    padding: "14px",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  },
  checkCircle: {
    width: "56px",
    height: "56px",
    backgroundColor: "#2ecc71",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "20px",
  },
} as const;
