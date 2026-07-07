import com.pdd.pop.sdk.message.WsClient;
import com.pdd.pop.sdk.message.MessageHandler;
import com.pdd.pop.sdk.message.model.Message;

public class PddMsgTest {
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
        client.connect();
        System.out.println("[TEST] connected, online=" + client.isOnline());
        try { Thread.sleep(60000); } catch (InterruptedException e) {}
        client.close();
    }
}
