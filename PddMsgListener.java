import com.pdd.pop.sdk.message.WsClient;
import com.pdd.pop.sdk.message.MessageHandler;
import com.pdd.pop.sdk.message.model.Message;
import com.pdd.pop.sdk.message.handler.SessionCloseHandler;
import javax.websocket.CloseReason;
import java.time.Instant;

public class PddMsgListener {
    public static void main(String[] args) {
        String clientId = args.length > 0 ? args[0] : System.getenv("PDD_CLIENT_ID");
        String clientSecret = args.length > 1 ? args[1] : System.getenv("PDD_CLIENT_SECRET");
        int seconds = args.length > 2 ? Integer.parseInt(args[2]) : 180;
        if (clientId == null || clientSecret == null) {
            System.err.println("Usage: java PddMsgListener <clientId> <clientSecret> [seconds]");
            System.exit(1);
        }
        WsClient client = new WsClient(clientId, clientSecret, new MessageHandler() {
            @Override
            public void onMessage(Message msg) throws Exception {
                System.out.println("[" + Instant.now() + "] [MSG] type=" + msg.getType());
                System.out.println("[" + Instant.now() + "] [MSG] mallId=" + msg.getMallID());
                System.out.println("[" + Instant.now() + "] [MSG] content=" + msg.getContent());
                System.out.println("---");
                System.out.flush();
            }
        });
        client.registerSessionCloseHandler(new SessionCloseHandler() {
            @Override
            public void onClose(WsClient ws, CloseReason reason) {
                System.out.println("[" + Instant.now() + "] [CLOSE] reason=" + reason);
                System.out.flush();
            }
        });
        try {
            client.connect();
            System.out.println("[" + Instant.now() + "] [TEST] connected, online=" + client.isOnline());
            System.out.flush();
            for (int i = 0; i < seconds; i++) {
                Thread.sleep(1000);
                if (i % 10 == 0) {
                    System.out.println("[" + Instant.now() + "] [TEST] " + i + "s online=" + client.isOnline());
                    System.out.flush();
                }
                if (!client.isOnline()) {
                    System.out.println("[" + Instant.now() + "] [TEST] connection lost at " + i + "s");
                    System.out.flush();
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            client.close();
            System.out.println("[" + Instant.now() + "] [TEST] listener stopped");
            System.out.flush();
        }
    }
}
