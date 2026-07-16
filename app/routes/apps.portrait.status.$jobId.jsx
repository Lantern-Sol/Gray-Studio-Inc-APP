import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request, params }) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({ error: "unknown_shop" }, { status: 401 });
  }

  const job = await db.portraitJob.findUnique({
    where: { id: params.jobId },
    include: { previews: true },
  });

  if (!job || job.shop !== session.shop) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({
    jobId: job.id,
    status: job.status,
    errorMessage: job.errorMessage ?? undefined,
    previews: job.previews.map((preview) => ({
      id: preview.id,
      imageUrl: `/apps/portrait/image/${preview.id}`,
    })),
  });
}
