/**
 * Upsert Influventure influencer-marketing templates without wiping other data.
 * Usage from repo root:
 *   pnpm --filter @notif/db exec dotenv -e ../../.env -- tsx prisma/add-influventure-templates.ts
 */
import { loadDbEnv } from "@notif/config";
import { prisma, type Prisma } from "@notif/db";
import { INFLUVENTURE_TEMPLATES } from "./influventure-templates";

loadDbEnv();

async function main(): Promise<void> {
  const project = await prisma.project.findUnique({ where: { slug: "influventure" } });
  if (!project) {
    throw new Error('Project slug "influventure" not found. Run add-influventure.ts first.');
  }

  let created = 0;
  let updated = 0;

  for (const tpl of INFLUVENTURE_TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { projectId: project.id, name: tpl.name },
    });

    const data = {
      title: tpl.title,
      body: tpl.body,
      imageUrl: tpl.imageUrl ?? null,
      deepLink: tpl.deepLink ?? null,
      dataJson: tpl.dataJson as Prisma.InputJsonValue,
      variables: tpl.variables,
    };

    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data });
      updated += 1;
      console.log(`  updated: ${tpl.name}`);
    } else {
      await prisma.template.create({
        data: { projectId: project.id, name: tpl.name, ...data },
      });
      created += 1;
      console.log(`  created: ${tpl.name}`);
    }
  }

  console.log(
    `Influventure templates ready for ${project.name} (${project.id}): +${created} ~${updated}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
