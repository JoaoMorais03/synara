import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMarkdownNote,
  deleteMarkdownNote,
  listMarkdownNotes,
  readMarkdownNote,
  renameMarkdownNote,
  resolveNotesDir,
  writeMarkdownNote,
} from "./markdownNotes";

const tempDirs: string[] = [];

function makeStateDir(): string {
  const dir = mkdtempSync(nodePath.join(os.tmpdir(), "synara-notes-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("markdownNotes", () => {
  it("creates, lists, reads, writes, renames, and deletes notes under stateDir/notes", async () => {
    const stateDir = makeStateDir();
    const created = await createMarkdownNote(stateDir, { title: "Ship checklist" });
    expect(created.id).toBe("Ship checklist.md");
    expect(created.title).toBe("Ship checklist");
    expect(created.content).toBe("");

    await writeMarkdownNote(stateDir, {
      id: created.id,
      content: "# Checklist\n\n- [ ] Land notes popup\n",
    });

    const listed = await listMarkdownNotes(stateDir);
    expect(listed.notesDir).toBe(resolveNotesDir(stateDir));
    expect(listed.notes).toHaveLength(1);
    expect(listed.notes[0]?.id).toBe(created.id);

    const read = await readMarkdownNote(stateDir, created.id);
    expect(read.content).toContain("Land notes popup");

    const renamed = await renameMarkdownNote(stateDir, {
      id: created.id,
      title: "Launch notes",
    });
    expect(renamed.id).toBe("Launch notes.md");
    expect(readFileSync(nodePath.join(listed.notesDir, renamed.id), "utf8")).toContain(
      "Land notes popup",
    );

    const deleted = await deleteMarkdownNote(stateDir, renamed.id);
    expect(deleted).toEqual({ deleted: true });
    expect((await listMarkdownNotes(stateDir)).notes).toEqual([]);
  });

  it("rejects path traversal note ids", async () => {
    const stateDir = makeStateDir();
    await expect(readMarkdownNote(stateDir, "../secret.md")).rejects.toThrow(/Invalid note id/);
    await expect(writeMarkdownNote(stateDir, { id: "/tmp/evil.md", content: "x" })).rejects.toThrow(
      /Invalid note id/,
    );
  });

  it("allocates unique filenames when titles collide", async () => {
    const stateDir = makeStateDir();
    const first = await createMarkdownNote(stateDir, { title: "Untitled" });
    const second = await createMarkdownNote(stateDir, { title: "Untitled" });
    expect(first.id).toBe("Untitled.md");
    expect(second.id).toBe("Untitled 2.md");
    writeFileSync(nodePath.join(resolveNotesDir(stateDir), "noise.txt"), "ignore");
    const listed = await listMarkdownNotes(stateDir);
    expect(listed.notes.map((note) => note.id).sort()).toEqual(["Untitled 2.md", "Untitled.md"]);
  });
});
