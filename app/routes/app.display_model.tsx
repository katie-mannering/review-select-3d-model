import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getPresignedUrl } from "../s3.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const modelUrl = await getPresignedUrl(
    "test-3d-display/mum-2-1-model-with-base.glb",
  );

  return { modelUrl };
};

export default function DisplayModels() {
  const { modelUrl } = useLoaderData<typeof loader>();

  return (
    <model-viewer
      src={modelUrl}
      alt="A rock"
      exposure="0.008"
      camera-controls
      ar
      ar-modes="webxr"
    ></model-viewer>
  );
}
