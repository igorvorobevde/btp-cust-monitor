/*
 * responseHeaders.groovy – script collection <REGION>_SLS_Common
 *
 * Last step before the End of T-1 and T-3 (happy path). The HTTPS sender returns every message header as an
 * HTTP response header, so the internal context (hydacResult, systemKey, shopSystem, interfacename, …) would
 * leak to the shop. Keeps only the response headers of the contract; problemJson does the same on the error path.
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def keep = ["Content-Type", "X-Correlation-ID", "Cache-Control", "CamelHttpResponseCode", "SAP_ApplicationID"]   // the last one feeds the MPL, not the shop
    def kept = [:]
    message.getHeaders().each { k, v -> if (keep.contains(k)) kept[k] = v }
    message.setHeaders(kept)
    return message
}
