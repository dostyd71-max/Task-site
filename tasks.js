const { getStore } = require("@netlify/blobs");

const ADMIN_PASSWORD = "111222";

exports.handler = async (event) => {
  const store = getStore("task-app-data");

  // --- ADMIN: upload new tasks ---
  if (event.httpMethod === "POST") {
    const password = event.headers["x-admin-password"];
    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: "Wrong password" }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Bad request" }) };
    }

    const newTexts = (body.tasks || [])
      .map((t) => (t || "").trim())
      .filter((t) => t.length > 0);

    if (newTexts.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No task text provided" }) };
    }

    const existing = (await store.get("tasks", { type: "json" })) || [];
    const nextId = existing.length ? Math.max(...existing.map((t) => t.id)) + 1 : 1;
    const added = newTexts.map((text, i) => ({ id: nextId + i, text }));
    const updated = existing.concat(added);

    await store.setJSON("tasks", updated);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, totalTasks: updated.length }),
    };
  }

  // --- ADMIN: delete a task ---
  if (event.httpMethod === "DELETE") {
    const password = event.headers["x-admin-password"];
    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: "Wrong password" }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Bad request" }) };
    }

    const idToDelete = body.id;
    const existing = (await store.get("tasks", { type: "json" })) || [];
    const updated = existing.filter((t) => t.id !== idToDelete);

    await store.setJSON("tasks", updated);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, tasks: updated }),
    };
  }

  // --- ADMIN: list all tasks (for the admin panel) ---
  if (event.httpMethod === "GET" && event.headers["x-admin-password"] === ADMIN_PASSWORD) {
    const tasks = (await store.get("tasks", { type: "json" })) || [];
    return { statusCode: 200, body: JSON.stringify({ tasks }) };
  }

  // --- VISITOR: get a random unseen task ---
  if (event.httpMethod === "GET") {
    const uid = event.queryStringParameters && event.queryStringParameters.uid;
    if (!uid) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing uid" }) };
    }

    const tasks = (await store.get("tasks", { type: "json" })) || [];
    if (tasks.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ task: null, message: "No tasks uploaded yet." }) };
    }

    const seenKey = `seen:${uid}`;
    let seen = (await store.get(seenKey, { type: "json" })) || [];

    let unseenIds = tasks.map((t) => t.id).filter((id) => !seen.includes(id));

    // Exhausted all tasks -> reset this visitor's history and start over
    if (unseenIds.length === 0) {
      seen = [];
      unseenIds = tasks.map((t) => t.id);
    }

    const chosenId = unseenIds[Math.floor(Math.random() * unseenIds.length)];
    seen.push(chosenId);
    await store.setJSON(seenKey, seen);

    const chosenTask = tasks.find((t) => t.id === chosenId);

    return {
      statusCode: 200,
      body: JSON.stringify({ task: chosenTask.text }),
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
};
