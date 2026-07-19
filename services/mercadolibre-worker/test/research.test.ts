import assert from "node:assert/strict";
import test from "node:test";
import { MercadoLibreClient, detailPath, flattenCategoryTree, parseHighlights, summarizeDetail } from "../src/research.js";

test("flattens a Mercado Libre category tree and identifies leaves", () => {
  const result = flattenCategoryTree([
    {
      id: "MLC1",
      name: "Root",
      children_categories: [
        { id: "MLC2", name: "Leaf", total_items_in_this_category: 12, children_categories: [] },
      ],
    },
  ]);
  assert.deepEqual(result.map(({ id, parentId, isLeaf }) => ({ id, parentId, isLeaf })), [
    { id: "MLC1", parentId: null, isLeaf: false },
    { id: "MLC2", parentId: "MLC1", isLeaf: true },
  ]);
  assert.equal(result[1].itemCount, 12);
});

test("parses only valid unique top-20 highlights", () => {
  const result = parseHighlights({
    content: [
      { id: "MLC100", position: 2, type: "ITEM" },
      { id: "MLC200", position: 1, type: "PRODUCT" },
      { id: "MLC300", position: 21, type: "ITEM" },
      { id: "MLC400", position: 2, type: "USER_PRODUCT" },
      { id: "MLC500", position: 3, type: "UNKNOWN" },
    ],
  });
  assert.deepEqual(result.map(({ id, position, type }) => ({ id, position, type })), [
    { id: "MLC200", position: 1, type: "PRODUCT" },
    { id: "MLC100", position: 2, type: "ITEM" },
  ]);
});

test("extracts a safe normalized detail summary", () => {
  const result = summarizeDetail({
    title: "Producto",
    permalink: "https://example.invalid/producto",
    price: 15990,
    currency_id: "CLP",
    thumbnail: "https://example.invalid/image.jpg",
    attributes: [{ id: "BRAND", value_name: "Marca" }],
  });
  assert.equal(result.title, "Producto");
  assert.equal(result.price, 15990);
  assert.equal(result.brand, "Marca");
});

test("maps every supported entity type to a fixed API path", () => {
  assert.equal(detailPath("ITEM", "MLC 1"), "/items/MLC%201");
  assert.equal(detailPath("PRODUCT", "MLC2"), "/products/MLC2");
  assert.equal(detailPath("USER_PRODUCT", "MLCU3"), "/user-products/MLCU3");
});

test("retries a rate-limited request with bounded backoff", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const client = new MercadoLibreClient({
    baseUrl: "https://api.example.invalid",
    accessToken: "test-token",
    requestDelayMs: 0,
    maxRetries: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? { message: "slow down" } : { content: [] }), {
        status: calls === 1 ? 429 : 200,
        headers: { "content-type": "application/json" },
      });
    },
    sleepImpl: async (milliseconds) => { sleeps.push(milliseconds); },
  });
  assert.deepEqual(await client.get("/highlights/MLC/category/MLC1"), { content: [] });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("does not retry an unavailable leaf ranking", async () => {
  let calls = 0;
  const client = new MercadoLibreClient({
    baseUrl: "https://api.example.invalid",
    accessToken: "test-token",
    requestDelayMs: 0,
    maxRetries: 3,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
    sleepImpl: async () => undefined,
  });
  await assert.rejects(() => client.get("/highlights/MLC/category/MLC1"), /not found/);
  assert.equal(calls, 1);
});
