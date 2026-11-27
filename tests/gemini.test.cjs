const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createGeminiPlanner, MODEL, validateAiPlan } = require("../desktop/gemini.cjs");

const validPlan = {
  title: "Build a personal finance tracker",
  summary: "Start with a small, testable budgeting app and ship it in clear increments.",
  tasks: [
    { title: "Define budget requirements", description: "List the income, category, and monthly budget flows.", category: "planning", estimatedHours: 3, priority: "high" },
    { title: "Build the expense entry flow", description: "Add validated expense entry and category selection.", category: "implementation", estimatedHours: 6, priority: "high" },
    { title: "Test and polish the dashboard", description: "Verify monthly totals and improve empty and error states.", category: "testing", estimatedHours: 4, priority: "medium" },
  ],
};

function responseFor(plan) {
  return {
    candidates: [{
      content: { parts: [{ text: JSON.stringify(plan) }] },
    }],
  };
}

test("sends a structured Gemini request without putting the API key in the URL", async () => {
  let requestUrl;
  let requestOptions;
  const generate = createGeminiPlanner({
    getApiKey: async () => "AIza-test-secret-key-123456789",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return { ok: true, status: 200, text: async () => JSON.stringify(responseFor(validPlan)) };
    },
  });

  const result = await generate("Build a personal finance tracker.", 7);
  const requestBody = JSON.parse(requestOptions.body);

  assert.equal(result.model, MODEL);
  assert.equal(result.tasks.length, 3);
  assert.equal(requestOptions.headers["x-goog-api-key"], "AIza-test-secret-key-123456789");
  assert.equal(requestUrl.includes("AIza-test-secret-key"), false);
  assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
  assert.match(requestBody.contents[0].parts[0].text, /Target deadline: 7 days/);
});

test("rejects unsafe or incomplete Gemini output", async () => {
  assert.equal(validateAiPlan({ ...validPlan, tasks: validPlan.tasks.slice(0, 2) }), false);
  const generate = createGeminiPlanner({
    getApiKey: async () => "AIza-test-secret-key-123456789",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseFor({ ...validPlan, tasks: [] })),
    }),
  });

  await assert.rejects(generate("Build a finance tracker", 5), /incomplete plan/);
});

test("reports free-tier rate limits without leaking provider response details", async () => {
  const generate = createGeminiPlanner({
    getApiKey: async () => "AIza-test-secret-key-123456789",
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });

  await assert.rejects(generate("Build a finance tracker", 5), /free-tier rate limit/);
});
