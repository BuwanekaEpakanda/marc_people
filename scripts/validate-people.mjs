import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const repoRoot = process.cwd();
const allowedRoles = [
  "Director",
  "Deputy Director",
  "Research Assistant",
  "Volunteer",
];

const frontmatterSchema = z
  .object({
    email: z.string().email(),
    post: z.enum(allowedRoles),
    name: z.string().trim().min(1),
    photo: z.string().trim().min(1).optional(),
  })
  .strict();

const markdownFiles = fs
  .readdirSync(repoRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".md") &&
      entry.name.toLowerCase() !== "readme.md",
  )
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const failures = [];
const seenEmails = new Map();

for (const fileName of markdownFiles) {
  const filePath = path.join(repoRoot, fileName);
  const raw = fs.readFileSync(filePath, "utf8");

  let parsed;
  try {
    parsed = matter(raw);
  } catch (error) {
    failures.push(
      `${fileName}: could not parse front matter (${error.message})`,
    );
    continue;
  }

  const result = frontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      failures.push(`${fileName}: ${issuePath} ${issue.message}`);
    }
    continue;
  }

  const data = result.data;
  const normalizedEmail = data.email.toLowerCase();

  if (seenEmails.has(normalizedEmail)) {
    failures.push(
      `${fileName}: duplicate email "${data.email}" also used in ${seenEmails.get(normalizedEmail)}`,
    );
  } else {
    seenEmails.set(normalizedEmail, fileName);
  }

  if (data.photo) {
    if (!data.photo.startsWith("./photos/")) {
      failures.push(
        `${fileName}: photo must use a repo-relative path starting with "./photos/"`,
      );
    }

    const photoPath = path.resolve(path.dirname(filePath), data.photo);
    if (!fs.existsSync(photoPath)) {
      failures.push(`${fileName}: photo file not found at ${data.photo}`);
    }
  }
}

if (markdownFiles.length === 0) {
  failures.push("No profile markdown files were found.");
}

if (failures.length > 0) {
  console.error("marc_people validation failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validated ${markdownFiles.length} profile file(s) successfully.`);
