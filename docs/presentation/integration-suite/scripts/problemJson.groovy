/*
 * problemJson.groovy – script collection <REGION>_SLS_Common
 *
 * Exception subprocess of T-1 and T-3, after classifyError. Builds the RFC 9457 application/problem+json
 * body and the HTTP response headers (design §6). The shop-facing status follows the stable error code,
 * not the status the target returned (errorHttpStatus is kept for the detail text only). Internal headers
 * are dropped so that they do not leak to the shop as response headers. The subprocess ends with a normal
 * End, so the shop gets this body instead of a Cloud Integration error page.
 * Reads: errorClass, errorCode, errorText, correlationId, validationErrors (JSON array or list, optional),
 *        retryAfterSeconds (externalised parameter copied to a property, default 30).
 */
import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def Message processData(Message message) {
    def props = message.getProperties()
    String cls = props.get("errorClass") ?: "PERMANENT_TECH"
    String code = props.get("errorCode") ?: "INTEGRATION_ERROR"
    String text = (props.get("errorText") ?: "unexpected error").toString().replaceAll(/\s+/, " ").take(500)
    String correlationId = props.get("correlationId") ?: props.get("SAP_MessageProcessingLogID") ?: ""
    int retryAfter = ((props.get("retryAfterSeconds") ?: "30").toString()) as Integer

    def statusByCode = [VALIDATION_FAILED: 400, UNKNOWN_SYSTEM: 404, UNKNOWN_EVENT_TYPE: 400, NOT_FOUND: 404,
                        PRECONDITION_FAILED: 422, INTEGRATION_ERROR: 500]
    def titleByCode = [VALIDATION_FAILED: "Request validation failed", UNKNOWN_SYSTEM: "Unknown system key or sales area",
                       UNKNOWN_EVENT_TYPE: "Unknown event type", NOT_FOUND: "Not found in the target system",
                       PRECONDITION_FAILED: "Precondition not met", INTEGRATION_ERROR: "Integration error",
                       MESSAGING_UNAVAILABLE: "Messaging not available"]
    Integer status = statusByCode[code]
    if (status == null && code.endsWith("_UNAVAILABLE")) status = 503
    if (status == null && code.endsWith("_BUSINESS_ERROR")) status = 422
    if (status == null) status = cls == "TRANSIENT" ? 503 : 500
    String title = titleByCode[code] ?: (code.endsWith("_UNAVAILABLE") ? "Target system not reachable"
            : code.endsWith("_BUSINESS_ERROR") ? "Business error in the target system" : code)

    def errors = []
    def raw = props.get("validationErrors")
    if (raw instanceof List) errors = raw
    else if (raw) { try { errors = new JsonSlurper().parseText(raw.toString()) } catch (ignored) { errors = [raw.toString()] } }

    def problem = [type: "https://hydac.com/problems/${code}".toString(), title: title, status: status,
                   detail: text, instance: correlationId, code: code, errors: errors]
    message.setBody(JsonOutput.toJson(problem))

    def headers = [:]
    if (message.getHeaders().get("SAP_ApplicationID")) headers["SAP_ApplicationID"] = message.getHeaders().get("SAP_ApplicationID")   // keeps the MPL searchable
    headers["CamelHttpResponseCode"] = status
    headers["Content-Type"] = "application/problem+json"
    if (correlationId) headers["X-Correlation-ID"] = correlationId
    if (cls == "TRANSIENT") headers["Retry-After"] = retryAfter.toString()
    message.setHeaders(headers)
    return message
}
