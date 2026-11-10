/*
 * raiseError.groovy – script collection <REGION>_SLS_Common
 *
 * Raises an exception with a deliberate classification, so that classifyError keeps it instead of
 * deriving one. Used as the seam check of T-1 after the ProcessDirect call (R-9), after validation and
 * precondition checks and after the result evaluation of T-6. Source of class / code / text, in this order:
 *   1. an <Error class=".." code=".." httpStatus="..">text</Error> body (seam contract, R-9),
 *   2. the properties errorClass / errorCode / errorText set by the preceding step.
 * A seam error without a usable <Error> body is still an error (PERMANENT_TECH), never a silent success.
 * Does nothing when nothing signals an error, so the step can sit unconditionally after a Request-Reply.
 * The <Error> element is read with regular expressions on purpose: it is tiny and fixed, and this avoids the
 * XmlSlurper package move between Groovy 2 and 3/4 and the reserved word "class" as an attribute name.
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props = message.getProperties()
    String cls = props.get("errorClass")
    String code = props.get("errorCode")
    String text = props.get("errorText")
    String status = props.get("errorHttpStatus")

    String body = message.getBody(String) ?: ""
    boolean seamError = "ERROR".equals(message.getHeaders().get("hydacResult")) || body.trim().startsWith("<Error")
    if (seamError) {
        def root = (body =~ /(?s)<Error\b([^>]*)>(.*?)<\/Error>/)
        if (root.find()) {
            String attrs = root.group(1)
            cls = attr(attrs, "class") ?: cls
            code = attr(attrs, "code") ?: code
            status = attr(attrs, "httpStatus") ?: status
            text = unescape(root.group(2).trim()) ?: text
        }
        if (!cls) { cls = "PERMANENT_TECH"; text = text ?: "backend signalled an error without a readable <Error> body: " + body.take(500) }
    }
    if (!cls) return message

    message.setProperty("errorClass", cls)
    message.setProperty("errorCode", code ?: "INTEGRATION_ERROR")
    message.setProperty("errorText", text ?: "")
    if (status) message.setProperty("errorHttpStatus", status)
    throw new Exception("${code ?: 'INTEGRATION_ERROR'}: ${text ?: ''}".toString())
}

static String attr(String attrs, String name) {
    def m = (attrs =~ /\b${name}="([^"]*)"/)
    return m.find() ? unescape(m.group(1)) : null
}

static String unescape(String s) {
    if (s == null) return null
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}
