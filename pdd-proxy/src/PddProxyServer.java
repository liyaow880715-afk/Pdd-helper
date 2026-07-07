import com.google.gson.*;
import com.pdd.pop.sdk.http.PopBaseHttpRequest;
import com.pdd.pop.sdk.http.PopClient;
import com.pdd.pop.sdk.http.PopHttpClient;
import com.pdd.pop.sdk.http.PopAccessTokenClient;
import com.pdd.pop.sdk.http.token.AccessTokenResponse;
import com.sun.net.httpserver.*;

import java.io.*;
import java.lang.reflect.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class PddProxyServer {
    private static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PDD_PROXY_PORT", "8081"));
    private static final Gson GSON = new GsonBuilder()
            .setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES)
            .serializeNulls()
            .create();
    private static final Gson FLAT_GSON = new Gson();

    private static final String[] REQUEST_PACKAGES = {
        "com.pdd.pop.sdk.http.api.pop.request.",
        "com.pdd.pop.sdk.http.api.file.request.",
        "com.pdd.pop.sdk.http.api.ark.request."
    };

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/health", new HealthHandler());
        server.createContext("/invoke", new InvokeHandler());
        server.createContext("/auth/token/create", new AuthCreateHandler());
        server.createContext("/auth/token/refresh", new AuthRefreshHandler());
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("[PDD-Proxy] Server started on port " + PORT);
    }

    // --- Utilities ---

    private static void sendJson(HttpExchange ex, int code, Object body) throws IOException {
        String text = (body instanceof String) ? (String) body : GSON.toJson(body);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    private static JsonObject readJson(HttpExchange ex) {
        try (InputStream is = ex.getRequestBody();
             Reader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(reader).getAsJsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    private static String toSetter(String snake) {
        StringBuilder sb = new StringBuilder("set");
        boolean upper = true;
        for (char c : snake.toCharArray()) {
            if (c == '_') {
                upper = true;
            } else if (upper) {
                sb.append(Character.toUpperCase(c));
                upper = false;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static Class<?> findRequestClass(String type) {
        String base = type.startsWith("pdd.") ? type.substring(4) : type;
        String[] parts = base.split("\\.");
        StringBuilder className = new StringBuilder("Pdd");
        for (String p : parts) {
            className.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1));
        }
        className.append("Request");
        String simple = className.toString();

        for (String pkg : REQUEST_PACKAGES) {
            try {
                return Class.forName(pkg + simple);
            } catch (ClassNotFoundException ignored) {}
        }
        try {
            return Class.forName("com.pdd.pop.sdk.http.token." + simple);
        } catch (ClassNotFoundException ignored) {}
        return null;
    }

    private static void setParams(Object request, JsonObject params) throws Exception {
        if (params == null) return;
        for (Map.Entry<String, JsonElement> entry : params.entrySet()) {
            String key = entry.getKey();
            JsonElement val = entry.getValue();
            if (val == null || val.isJsonNull()) continue;

            String setterName = toSetter(key);
            Method setter = null;
            for (Method m : request.getClass().getMethods()) {
                if (m.getName().equals(setterName) && m.getParameterCount() == 1) {
                    setter = m;
                    break;
                }
            }
            if (setter == null) continue;

            Class<?> paramType = setter.getParameterTypes()[0];
            Object arg = convertJsonElement(val, paramType);
            setter.invoke(request, arg);
        }
    }

    @SuppressWarnings("unchecked")
    private static Object convertJsonElement(JsonElement el, Class<?> target) {
        if (target == String.class) return el.getAsString();
        if (target == Integer.class || target == int.class) return el.getAsInt();
        if (target == Long.class || target == long.class) return el.getAsLong();
        if (target == Boolean.class || target == boolean.class) return el.getAsBoolean();
        if (target == Double.class || target == double.class) return el.getAsDouble();
        if (target == Float.class || target == float.class) return el.getAsFloat();
        return FLAT_GSON.fromJson(el, target);
    }

    // --- Handlers ---

    static class HealthHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            sendJson(ex, 200, Map.of("status", "ok", "service", "pdd-proxy"));
        }
    }

    static class InvokeHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                sendJson(ex, 405, Map.of("error", "Method Not Allowed"));
                return;
            }
            JsonObject body = readJson(ex);
            String type = body.has("type") ? body.get("type").getAsString() : null;
            String clientId = body.has("clientId") ? body.get("clientId").getAsString() : null;
            String clientSecret = body.has("clientSecret") ? body.get("clientSecret").getAsString() : null;
            String accessToken = body.has("accessToken") && !body.get("accessToken").isJsonNull()
                    ? body.get("accessToken").getAsString() : null;
            JsonObject params = body.has("params") ? body.get("params").getAsJsonObject() : null;

            if (type == null || clientId == null || clientSecret == null) {
                sendJson(ex, 400, Map.of("error", "Missing required fields: type, clientId, clientSecret"));
                return;
            }

            try {
                Class<?> reqClass = findRequestClass(type);
                if (reqClass == null) {
                    sendJson(ex, 404, Map.of("error", "Request class not found for type: " + type));
                    return;
                }

                Object request = reqClass.getDeclaredConstructor().newInstance();
                setParams(request, params);

                PopClient client = new PopHttpClient(clientId, clientSecret);
                Method syncInvoke = PopClient.class.getMethod("syncInvoke", PopBaseHttpRequest.class, String.class);
                Object response = syncInvoke.invoke(client, request, accessToken);

                String json = GSON.toJson(response);
                sendJson(ex, 200, json);
            } catch (InvocationTargetException ite) {
                Throwable cause = ite.getCause();
                sendJson(ex, 502, Map.of("error", cause != null ? cause.getMessage() : ite.getMessage()));
            } catch (Exception e) {
                sendJson(ex, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    static class AuthCreateHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                sendJson(ex, 405, Map.of("error", "Method Not Allowed"));
                return;
            }
            JsonObject body = readJson(ex);
            String code = body.has("code") ? body.get("code").getAsString() : null;
            String clientId = body.has("clientId") ? body.get("clientId").getAsString() : null;
            String clientSecret = body.has("clientSecret") ? body.get("clientSecret").getAsString() : null;

            if (code == null || clientId == null || clientSecret == null) {
                sendJson(ex, 400, Map.of("error", "Missing required fields: code, clientId, clientSecret"));
                return;
            }

            try {
                PopAccessTokenClient client = new PopAccessTokenClient(clientId, clientSecret);
                AccessTokenResponse resp = client.generate(code);
                JsonObject wrapper = new JsonObject();
                wrapper.add("pop_auth_token_create_response", GSON.toJsonTree(resp));
                sendJson(ex, 200, wrapper.toString());
            } catch (Exception e) {
                sendJson(ex, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    static class AuthRefreshHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                sendJson(ex, 405, Map.of("error", "Method Not Allowed"));
                return;
            }
            JsonObject body = readJson(ex);
            String refreshToken = body.has("refreshToken") ? body.get("refreshToken").getAsString() : null;
            String clientId = body.has("clientId") ? body.get("clientId").getAsString() : null;
            String clientSecret = body.has("clientSecret") ? body.get("clientSecret").getAsString() : null;

            if (refreshToken == null || clientId == null || clientSecret == null) {
                sendJson(ex, 400, Map.of("error", "Missing required fields: refreshToken, clientId, clientSecret"));
                return;
            }

            try {
                PopAccessTokenClient client = new PopAccessTokenClient(clientId, clientSecret);
                AccessTokenResponse resp = client.refresh(refreshToken);
                JsonObject wrapper = new JsonObject();
                wrapper.add("pop_auth_token_refresh_response", GSON.toJsonTree(resp));
                sendJson(ex, 200, wrapper.toString());
            } catch (Exception e) {
                sendJson(ex, 500, Map.of("error", e.getMessage()));
            }
        }
    }
}
