/*
 * classifyError.groovy – script collection <REGION>_SLS_Common
 *
 * First step of every exception subprocess (R-3). Classifies the caught exception into
 *   TRANSIENT          – retried (async only): target 5xx / 429 / 408, timeouts, connection problems, JMS / AMQP down
 *   PERMANENT_TECH     – never retried: validation, mapping, 4xx from a non-SAP target, unknown exception type
 *   PERMANENT_BUSINESS – never retried: not found, business error of the target (SAP sends E messages as HTTP 400)
 * and writes errorClass, errorCode, errorText, errorHttpStatus as properties and MPL custom headers.
 *
 * A classification that an earlier step set deliberately (raiseError.groovy, resolveEventType.groovy) is kept.
 * A status that evaluateHttpStatus.groovy stored in errorHttpStatus takes precedence over the exception text.
 * The property errorTarget (S4 | MONITOR | SHOP | MESSAGING), set by a Content Modifier before each
 * Request-Reply, names the target in the code (<TARGET>_UNAVAILABLE, <TARGET>_BUSINESS_ERROR); while it is
 * unset the flow is still parsing or validating the request, so parser and schema errors are VALIDATION_FAILED.
 *
 * shortcut: the exception-type patterns are taken from SAP's documentation and the US flows, not yet
 * verified on the tenant; extend the patterns after the first DEV test cycle (design §6).
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props = message.getProperties()
    Throwable ex = props.get("CamelExceptionCaught") as Throwable

    String cls = props.get("errorClass")
    String code = props.get("errorCode")
    String text = props.get("errorText")
    Integer status = toInt(props.get("errorHttpStatus"))

    if (!cls) {
        String target = (props.get("errorTarget") ?: "").toString().toUpperCase()
        String names = classChain(ex)
        text = (text ?: ex?.getMessage() ?: "unknown error").toString()
        if (status == null) status = httpStatus(ex, text)

        if (!target && status == null && names =~ /(?i)json|SAXParse|XmlValidation|SchemaValidation|ValidationException/) {
            cls = "PERMANENT_TECH"; code = "VALIDATION_FAILED"            // request could not be parsed or validated
        } else if (status != null) {
            target = target ?: "S4"
            if (status >= 500 || status == 429 || status == 408) {
                cls = "TRANSIENT"; code = "${target}_UNAVAILABLE"
            } else if (status == 404) {
                // the shop event named an entity that does not exist → integration problem; SAP/monitor 404 → business
                cls = target == "SHOP" ? "PERMANENT_TECH" : "PERMANENT_BUSINESS"
                code = target == "SHOP" ? "INTEGRATION_ERROR" : "NOT_FOUND"
            } else if (status == 422 || status == 409 || (status == 400 && target == "S4" && !(text =~ /\/IW(BEP|FND|COR)\//))) {
                // SAP Gateway returns E messages as HTTP 400 with an error body → business, not technical;
                // a 400 that quotes a Gateway framework code (/IWBEP/…, /IWFND/…) is our request, i.e. technical
                cls = "PERMANENT_BUSINESS"; code = "${target}_BUSINESS_ERROR"
            } else if (status == 400 && target == "MONITOR") {
                cls = "PERMANENT_TECH"; code = "VALIDATION_FAILED"        // the intake's message list: our mapping is wrong (§9)
            } else {
                cls = "PERMANENT_TECH"; code = "INTEGRATION_ERROR"        // 400 (other), 401, 403, 405, 415, …
            }
        } else if (names =~ /(?i)jms|qpid|amqp/) {
            cls = "TRANSIENT"; code = "MESSAGING_UNAVAILABLE"
        } else if (names =~ /(?i)timeout|ConnectException|NoRouteToHost|UnknownHost|SocketException|ConnectionClosed|ConnectionReset/) {
            cls = "TRANSIENT"; code = "${target ?: 'S4'}_UNAVAILABLE"
        } else {
            cls = "PERMANENT_TECH"; code = "INTEGRATION_ERROR"            // mapping, script, schema, TLS, anything unknown
        }
    }
    code = (code ?: "INTEGRATION_ERROR").toString()                       // a preset class without a code must not NPE here

    message.setProperty("errorClass", cls)
    message.setProperty("errorCode", code)
    message.setProperty("errorText", (text ?: "").toString().take(2000))
    if (status != null) message.setProperty("errorHttpStatus", status.toString())

    def log = messageLogFactory.getMessageLog(message)
    if (log != null) {
        log.addCustomHeaderProperty("errorClass", cls)
        log.addCustomHeaderProperty("errorCode", code)
    }
    return message
}

/** Class names of the exception and its causes, joined, for pattern matching. */
static String classChain(Throwable ex) {
    def names = []
    def t = ex
    int guard = 0
    while (t != null && guard++ < 10) {
        names << t.getClass().getName()
        t = t.getCause()
    }
    return names.join(" ")
}

/** HTTP status of the target: statusCode of an HttpOperationFailedException (HTTP adapter), else the status in the
 *  message text – "statusCode: 503" (HTTP adapter), "Service Unavailable : 503 : HTTP/1.1 503 …" (OData adapter),
 *  "status code 404", "HTTP 422" – else null. */
static Integer httpStatus(Throwable ex, String text) {
    def t = ex
    int guard = 0
    while (t != null && guard++ < 10) {
        if (t.hasProperty("statusCode")) {
            Integer s = toInt(t.statusCode)
            if (s != null && s >= 100) return s
        }
        t = t.getCause()
    }
    // the third alternative is limited to 4xx/5xx so that "line 1: 120:" or a clock time never passes as a status
    def m = (text ?: "") =~ /(?i)(?:status(?:\s*code)?|http(?:\s*error)?)\s*[:=]?\s*([1-5]\d\d)\b|HTTP\/\d\.\d\s+([1-5]\d\d)\b|:\s*([45]\d\d)\s*:/
    if (!m.find()) return null
    return (m.group(1) ?: m.group(2) ?: m.group(3)) as Integer
}

static Integer toInt(Object value) {
    if (value == null) return null
    try { return value.toString().trim() as Integer } catch (ignored) { return null }
}
