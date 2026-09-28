import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { feedbackSurveyTestDatabaseUrl } from "../lib/easyt/feedback-survey.ts";
import { createFeedbackSurveyStore, type FeedbackSurveySql } from "../lib/easyt/feedback-survey-store.ts";

test("database guard refuses non-local or wrong database before connecting", () => {
  assert.equal(feedbackSurveyTestDatabaseUrl(undefined), null);
  assert.equal(feedbackSurveyTestDatabaseUrl("postgres://user:pass@production.example/morrovia_feedback_test"), null);
  assert.equal(feedbackSurveyTestDatabaseUrl("postgres://user:pass@localhost/morrovia"), null);
  assert.equal(feedbackSurveyTestDatabaseUrl("postgres://user:pass@localhost/morrovia_feedback_test")?.hostname, "localhost");
});

function sqlTag(client: pg.PoolClient): FeedbackSurveySql {
  return async (strings, ...values) => {
    const query = strings.reduce((text, segment, index) => text + (index ? `$${index}` : "") + segment, "");
    return (await client.query(query, values)).rows as Record<string, unknown>[];
  };
}

const safeUrl = feedbackSurveyTestDatabaseUrl(process.env.MORROVIA_FEEDBACK_TEST_DATABASE_URL);
test("isolated survey SQL concurrency, replay, dismissal and retention", { skip: !safeUrl && "DB GATE UNVERIFIED: no safe local feedback test database" }, async () => {
  assert.ok(safeUrl);
  const pool = new pg.Pool({ connectionString: safeUrl.toString(), max: 3 });
  const schema = `feedback_survey_${Date.now()}_${Math.floor(Math.random() * 1e7)}`;
  const setup = await pool.connect();
  const second = await pool.connect();
  try {
    // The guard above completes before the first SQL statement.
    await setup.query(`create schema "${schema}"`);
    await setup.query(`set search_path to "${schema}"`);
    await second.query(`set search_path to "${schema}"`);
    for (const migration of ["0001_easyt_foundation.sql", "0003_easyt_feedback.sql", "0008_easyt_feedback_triage.sql", "0015_easyt_feedback_survey.sql"]) {
      await setup.query(readFileSync(new URL(`../db/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await setup.query("insert into easyt_users (id,email) values ('a','a@example.test'),('b','b@example.test')");
    const a = createFeedbackSurveyStore(sqlTag(setup));
    const b = createFeedbackSurveyStore(sqlTag(second));
    assert.deepEqual(await a.state("a"), { dismissed: false, submitted: false });
    await a.dismiss("a");
    await a.dismiss("a");
    assert.deepEqual(await a.state("a"), { dismissed: true, submitted: false });
    assert.equal(await a.submit({ ownerId: "a", attemptId: "00000000-0000-4000-8000-000000000001", rating: 4, comment: " useful " }), "created");
    assert.equal(await b.submit({ ownerId: "a", attemptId: "00000000-0000-4000-8000-000000000001", rating: 4, comment: "useful" }), "replayed");
    assert.equal(await b.submit({ ownerId: "a", attemptId: "00000000-0000-4000-8000-000000000001", rating: 3, comment: "useful" }), "payload-conflict");
    assert.equal(await b.submit({ ownerId: "a", attemptId: "00000000-0000-4000-8000-000000000002", rating: 5 }), "already-submitted");
    assert.deepEqual(await a.state("a"), { dismissed: true, submitted: true });
    const concurrent = await Promise.all([
      a.submit({ ownerId: "b", attemptId: "00000000-0000-4000-8000-000000000003", rating: 2 }),
      b.submit({ ownerId: "b", attemptId: "00000000-0000-4000-8000-000000000004", rating: 5 }),
    ]);
    assert.deepEqual(concurrent.sort(), ["already-submitted", "created"]);
    assert.equal((await setup.query("select count(*)::int as count from easyt_feedback where owner_id='b' and survey_id is not null")).rows[0].count, 1);
    await setup.query("insert into easyt_feedback (owner_id,rating) values ('b',3),('b',4)");
    assert.equal((await setup.query("select count(*)::int as count from easyt_feedback where owner_id='b' and survey_id is null")).rows[0].count, 2);
    await setup.query("delete from easyt_users where id='a'");
    assert.equal((await setup.query("select count(*)::int as count from easyt_feedback_survey_state where owner_id='a'")).rows[0].count, 0);
    assert.equal((await setup.query("select count(*)::int as count from easyt_feedback where owner_id is null and survey_id is not null")).rows[0].count, 1);
  } finally {
    await second.release();
    await setup.query(`drop schema if exists "${schema}" cascade`);
    setup.release();
    await pool.end();
  }
});
