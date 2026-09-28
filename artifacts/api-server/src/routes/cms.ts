import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cmsPagesTable } from "@workspace/db";
import { GetCmsPageParams, GetCmsPageResponse } from "@workspace/api-zod";
import { ensureCmsPages } from "../lib/cmsDefaults";

const router: IRouter = Router();

router.get("/cms-pages/:slug", async (req, res): Promise<void> => {
  const params = GetCmsPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ message: "Page not found" });
    return;
  }
  await ensureCmsPages();
  const [page] = await db
    .select()
    .from(cmsPagesTable)
    .where(eq(cmsPagesTable.slug, params.data.slug));
  if (!page) {
    res.status(404).json({ message: "Page not found" });
    return;
  }
  res.json(
    GetCmsPageResponse.parse({
      slug: page.slug,
      title: page.title,
      content: page.content,
      updatedAt: page.updatedAt.toISOString(),
    }),
  );
});

export default router;
