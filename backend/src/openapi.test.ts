import assert from "node:assert/strict";
import test from "node:test";
import { openApiDocument } from "./openapi.js";

const methods = ["get", "post", "put", "patch", "delete"] as const;

test("documents every backend endpoint with a tag, summary, and responses", () => {
  const operations = Object.values(openApiDocument.paths).flatMap((pathItem) =>
    methods.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [operation] : [];
    }),
  );

  assert.equal(operations.length, 66);
  for (const operation of operations) {
    assert.ok(operation.summary);
    assert.ok(operation.tags?.length);
    assert.ok(Object.keys(operation.responses).length);
  }
});

test("derives request constraints from the game creation validator", () => {
  const operation = openApiDocument.paths["/api/games"]?.post;
  assert.ok(operation?.requestBody && "content" in operation.requestBody);

  const schema = operation.requestBody.content["application/json"]?.schema;
  assert.ok(schema && "required" in schema);
  assert.deepEqual(schema.required, ["name", "maker", "shelfId"]);
});

test("marks authentication routes public and resource routes bearer-protected", () => {
  assert.deepEqual(openApiDocument.paths["/api/auth/login"]?.post?.security, []);
  assert.deepEqual(openApiDocument.security, [{ BearerAuth: [] }]);
  assert.equal(openApiDocument.paths["/api/games"]?.get?.security, undefined);
});
