import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { storage } from "../s3.server";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const order = await db.modelOrder.findUnique({
    where: { upload_token: params.token },
  });

  if (!order) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    orderNumber: order.order_number,
    firstName: order.customer_first_name,
    status: order.order_status,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const order = await db.modelOrder.findUnique({
    where: { upload_token: params.token },
  });

  if (!order) {
    throw new Response("Not Found", { status: 404 });
  }

  if (order.order_status !== "AWAITING_IMAGE") {
    return { error: "This order is no longer accepting photo uploads." };
  }

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please select a photo to upload." };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "Please upload a JPEG, PNG, or WebP image." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "Photo must be under 15 MB." };
  }

  const MIME_TO_IMAGE_TYPE: Record<string, "JPG" | "PNG" | "WEBP"> = {
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WEBP",
  };
  const imageType = MIME_TO_IMAGE_TYPE[file.type] ?? "JPG";
  const ext = imageType.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Create the DB record first to obtain its auto-increment id, which is
  // required by the S3 key convention: image-to-bust/{surname}-{orderId}/inputs/{id}.{ext}
  const input = await db.modelOrderInputs.create({
    data: {
      modelOrderId: order.id,
      image_type: imageType,
      uploaded: new Date(),
      url: "", // filled in after upload
    },
  });

  const s3Key = `image-to-bust/${order.customer_last_name}-${order.id}/inputs/${input.id}.${ext}`;
  await storage.upload(s3Key, buffer, file.type);

  await db.$transaction([
    db.modelOrderInputs.update({
      where: { id: input.id },
      data: { url: s3Key },
    }),
    db.modelOrder.update({
      where: { id: order.id },
      data: { order_status: "CUSTOMER_IMAGE_UPLOADED" },
    }),
  ]);

  return { success: true, orderNumber: order.order_number };
};

export default function CustomerUpload() {
  const { orderNumber, firstName, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const alreadyProcessing = status !== "AWAITING_IMAGE";

  if (actionData && "success" in actionData && actionData.success) {
    return (
      <Page>
        <div style={styles.card}>
          <Checkmark />
          <h1 style={styles.heading}>Photo received — thank you!</h1>
          <p style={styles.body}>
            We&rsquo;ve got your photo for order{" "}
            <strong>{actionData.orderNumber}</strong> and our team will begin
            preparing your 3D model. We&rsquo;ll email you as soon as it&rsquo;s
            ready for review.
          </p>
        </div>
      </Page>
    );
  }

  if (alreadyProcessing) {
    return (
      <Page>
        <div style={styles.card}>
          <h1 style={styles.heading}>Already received</h1>
          <p style={styles.body}>
            We already have your photo for order <strong>{orderNumber}</strong>.
            We&rsquo;ll be in touch when your 3D model is ready.
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div style={styles.card}>
        <h1 style={styles.heading}>Upload your photo</h1>
        <p style={styles.body}>
          Hi {firstName}, thanks for your order <strong>{orderNumber}</strong>!
          To create your personalised 3D model, please upload a clear,
          well&ndash;lit photo of the subject below.
        </p>

        <div style={styles.tips}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Photo tips:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Face the subject directly towards the camera</li>
            <li>Use natural light where possible</li>
            <li>Plain or neutral background works best</li>
            <li>JPEG, PNG or WebP &mdash; up to 15 MB</li>
          </ul>
        </div>

        <Form method="post" encType="multipart/form-data">
          <label style={styles.label} htmlFor="photo">
            Select photo
          </label>
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            style={styles.fileInput}
          />

          {actionData && "error" in actionData && (
            <p style={styles.error}>{actionData.error}</p>
          )}

          <button type="submit" style={styles.button}>
            Upload photo
          </button>
        </Form>
      </div>
    </Page>
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
    maxWidth: "560px",
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
    margin: "0 0 24px",
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#444",
  },
  tips: {
    backgroundColor: "#f9f9f6",
    border: "1px solid #e8e8e0",
    borderRadius: "6px",
    padding: "16px 20px",
    fontSize: "14px",
    lineHeight: 1.6,
    marginBottom: "28px",
    color: "#555",
  },
  label: {
    display: "block",
    fontWeight: 600,
    fontSize: "14px",
    marginBottom: "8px",
  },
  fileInput: {
    display: "block",
    width: "100%",
    marginBottom: "16px",
    fontSize: "14px",
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
