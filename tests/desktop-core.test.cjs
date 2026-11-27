const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, stat, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { createPlanner, validateInput } = require("../desktop/core.cjs");

const aiPlan = {
  provider: "Google Gemini",
  model: "gemini-3.8-flash",
  title: "Build a study planner",
  summary: "Ship the smallest useful study planner in clear steps.",
  tasks: [
    { title: "Define study flows", description: "Document how a learner creates and reviews study sessions.", category: "planning", estimatedHours: 2, priority: "high" },
    { title: "Create session tracking", description: "Build the session form and save study activity locally.", category: "implementation", estimatedHours: 5, priority: "high" },
    { title: "Verify progress summaries", description: "Test weekly totals and empty states with realistic entries.", category: "testing", estimatedHours: 3, priority: "medium" },
  ],
};

async function createTemporaryPlanner(t, generator = async () => aiPlan) {
  const directory = await mkdtemp(join(tmpdir(), "nexroute-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    storePath: join(directory, "plans.json"),
    planner: createPlanner({
      storePath: join(directory, "plans.json"),
      aiGenerator: generator,
    }),
  };
}

test("validates Unicode byte limits before calling the AI planner", () => {
  assert.throws(() => validateInput("🙂".repeat(1500), 5), /4000 UTF-8 bytes/);
  assert.throws(() => validateInput("A project", 31), /between 1 and 30/);
});

test("persists real AI roadmaps, serializes writes, and deletes selected plans", async (t) => {
  const { directory, planner } = await createTemporaryPlanner(t);
  const created = await Promise.all([
    planner.createPlan("Build a study planner", 5),
    planner.createPlan("Build an expense tracker", 7),
    planner.createPlan("Build a quiz app", 3),
  ]);
  const saved = await planner.getPlans();
  assert.equal(saved.plans.length, 3);
  assert.deepEqual(saved.plans[0].aiPlan, aiPlan);
  assert.equal(saved.removedDemoPlans, 0);

  await planner.deletePlan(created[0].id);
  assert.equal((await planner.getPlans()).plans.length, 2);

  if (process.platform !== "win32") {
    const savedMode = (await stat(join(directory, "plans.json"))).mode & 0o777;
    assert.equal(savedMode, 0o600);
  }
});

test("does not save a plan when the configured AI provider fails", async (t) => {
  const { planner } = await createTemporaryPlanner(t, async () => {
    throw new Error("Connect a Gemini API key in Settings to generate an AI plan.");
  });

  await assert.rejects(planner.createPlan("Build a study planner", 5), /Connect a Gemini API key/);
  assert.deepEqual((await planner.getPlans()).plans, []);
});

test("stores only the supported roadmap fields from provider responses", async (t) => {
  const providerResponse = {
    ...aiPlan,
    quotaRemaining: 999999,
    tasks: aiPlan.tasks.map((task) => ({ ...task, providerTokens: 12345 })),
  };
  const { planner } = await createTemporaryPlanner(t, async () => providerResponse);

  const created = await planner.createPlan("Build a study planner", 5);
  const persisted = await planner.getPlans();

  assert.equal("quotaRemaining" in created.aiPlan, false);
  assert.equal("providerTokens" in created.aiPlan.tasks[0], false);
  assert.deepEqual(persisted.plans[0].aiPlan, aiPlan);
});

test("migrates valid Gemini plans and removes old demo-only plans", async (t) => {
  const { planner, storePath } = await createTemporaryPlanner(t);
  const baseLegacy = {
    id: randomUUID(),
    idea: "Build a study planner",
    daysAvailable: 5,
    daysNeeded: 2,
    totalTokens: 1200,
    tasks: [{ title: "Example", type: "Planning", tokens: 1200, day: 1, provider: "Gemini" }],
    providers: [],
    schedule: [],
    feasible: true,
    createdAt: new Date().toISOString(),
    state: "planned",
    report: null,
  };
  await writeFile(
    storePath,
    JSON.stringify({
      schemaVersion: 1,
      plans: [
        { ...baseLegacy, aiPlan },
        { ...baseLegacy, id: randomUUID(), idea: "Old sample plan" },
      ],
    }),
  );

  const result = await planner.getPlans();
  assert.equal(result.plans.length, 1);
  assert.equal(result.removedDemoPlans, 1);
  assert.deepEqual(result.plans[0].aiPlan, aiPlan);
  assert.equal(JSON.parse(await readFile(storePath, "utf8")).schemaVersion, 2);
});

test("rejects malformed or oversized saved roadmap data", async (t) => {
  const { directory, planner } = await createTemporaryPlanner(t);
  await writeFile(join(directory, "plans.json"), JSON.stringify({ schemaVersion: 2, plans: [{ id: "bad" }] }));
  await assert.rejects(planner.getPlans(), /invalid or damaged/);
  await writeFile(join(directory, "plans.json"), "{not json");
  await assert.rejects(planner.getPlans(), SyntaxError);
  await writeFile(join(directory, "plans.json"), "x".repeat(5 * 1024 * 1024 + 1));
  await assert.rejects(planner.getPlans(), /size limit/);
});
