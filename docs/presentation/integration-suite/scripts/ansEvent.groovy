/*
 * ansEvent.groovy – script collection <REGION>_SLS_Common
 *
 * Local process "Notify" of T-6 and T-7 (dead-letter path) and GenericIS_QueueWatch, before the HTTP receiver
 * that posts to the Alert Notification Service producer API (POST /cf/producer/v1/resource-events, OAuth 2.0
 * alias ANS_<STG>, one instance per tenant). Builds the event; routing happens in ANS by eventType, severity
 * and tags (design §13).
 * Reads the properties region, stage, interfacename, errorClass, errorCode, errorText, correlationId,
 * retryCount and, where present, shopSystem, entity, entityId, incrementId. A caller that wants its own text
 * (the QueueWatch summary) sets alertSubject and alertBody; they replace the dead-letter wording.
 */
import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput

def Message processData(Message message) {
    def p = message.getProperties()
    def h = message.getHeaders()
    def ex = p.get("CamelExceptionCaught")
    // T-4 and T-5 carry the context as headers and have no classifyError step: fall back to headers and the exception
    String region = p.get("region") ?: "XX"
    String stage = p.get("stage") ?: "DEV"
    String iface = p.get("interfacename") ?: h.get("interfacename") ?: "unknown"
    String cls = p.get("errorClass") ?: "PERMANENT_TECH"
    String code = p.get("errorCode") ?: "INTEGRATION_ERROR"
    String text = (p.get("errorText") ?: ex?.getMessage() ?: "").toString().take(1000)
    String correlationId = p.get("correlationId") ?: h.get("correlationId") ?: p.get("SAP_MessageProcessingLogID") ?: ""
    String entityRef = [p.get("entity"), p.get("incrementId") ?: p.get("entityId")].findAll { it }.join(" ")

    // business failures go to the back office (WARNING), technical ones and exhausted retries to purplecat (ERROR)
    String severity = cls == "PERMANENT_BUSINESS" ? "WARNING" : "ERROR"
    String subject = p.get("alertSubject") ?: "[${region}-${stage}] ${iface}: ${code}${entityRef ? ' – ' + entityRef : ''}".toString()
    String body = p.get("alertBody") ?: ("Dead-lettered after ${p.get('retryCount') ?: 0} retries. ${code}: ${text}\n" +
            "Correlation id: ${correlationId}\nShop system: ${p.get('shopSystem') ?: '-'}\n" +
            "Search in Monitor → Integrations and APIs by Application Message ID = correlation id.").toString()

    def event = [
        eventType: "HYDAC.Webshop.${region}.${iface}.${cls}".toString(),
        severity : severity,
        category : "ALERT",
        subject  : subject,
        body     : body,
        resource : [resourceName: iface, resourceType: "iflow", tags: [region: region, stage: stage]],
        tags     : [errorClass: cls, errorCode: code, correlationId: correlationId, interfacename: iface,
                    shopSystem: (p.get("shopSystem") ?: "").toString(), entityId: (p.get("entityId") ?: "").toString()]
    ]
    message.setBody(JsonOutput.toJson(event))
    message.setHeader("Content-Type", "application/json")
    return message
}
