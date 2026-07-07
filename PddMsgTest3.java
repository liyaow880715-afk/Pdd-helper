import com.pdd.pop.sdk.message.WsClient;
import com.pdd.pop.sdk.message.MessageHandler;
import com.pdd.pop.sdk.message.model.Message;
import com.pdd.pop.sdk.message.handler.SessionCloseHandler;
import javax.websocket.CloseReason;

public class PddMsgTest3 {
    public static void main(String[] args) {
        String clientId = "16c201de6cc54163921dbc8c829426dd";
        String clientSecret = "34d5702baf1e087fb900db039536ae0610f8dd43";
        WsClient client = new WsClient(clientId, clientSecret, new MessageHandler() {
            @Override
            public void onMessage(Message msg) throws Exception {
                System.out.println("[MSG] type=" + msg.getType());
                System.out.println("[MSG] mallId=" + msg.getMallID());
                System.out.println("[MSG] content=" + msg.getContent());
                System.out.println("---");
            }
        });
        client.registerSessionCloseHandler(new SessionCloseHandler() {
            @Override
            public void onClose(WsClient ws, CloseReason reason) {
                System.out.println("[CLOSE] reason=" + reason);
            }
        });
        try {
            client.connect();
            System.out.println("[TEST] connected, online=" + client.isOnline());
            for (int i = 0; i < 60; i++) {
                Thread.sleep(1000);
                if (i % 5 == 0) System.out.println("[TEST] " + i + "s online=" + client.isOnline());
                if (!client.isOnline()) {
                    System.out.println("[TEST] not online at " + i + "s");
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            client.close();
        }
    }
}
