/*
 * mplHeaders.groovy – script collection <REGION>_SLS_Common
 *
 * Step: "Capture context" / "Restore context" of T-1, T-3, T-6, T-7 (after the Content Modifier that
 * fills the context properties). Copies the context to MPL custom header properties (R-6) and makes the
 * correlation id the Application Message ID (R-5). Missing values are skipped, nothing is overwritten.
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props = message.getProperties()
    def headers = message.getHeaders()

    // correlationId is the header name inside the chain; X-Correlation-ID only arrives from the shop (T-1, T-3, Allowed Headers)
    def correlationId = props.get("correlationId") ?: headers.get("correlationId") ?: headers.get("X-Correlation-ID") ?: props.get("SAP_MessageProcessingLogID")
    if (correlationId) {
        message.setProperty("correlationId", correlationId.toString())
        message.setHeader("SAP_ApplicationID", correlationId.toString())   // a header, not a property – else the Application Message ID stays empty
    }

    def log = messageLogFactory.getMessageLog(message)
    if (log != null) {
        ["shopSystem", "websiteCode", "entity", "entityId", "incrementId", "correlationId", "sapDocument",
         "interfacename", "systemKey", "errorClass", "errorCode"].each { name ->
            def value = props.get(name) ?: headers.get(name)
            if (value != null && value.toString().trim()) {
                log.addCustomHeaderProperty(name, value.toString())
            }
        }
    }
    return message
}
