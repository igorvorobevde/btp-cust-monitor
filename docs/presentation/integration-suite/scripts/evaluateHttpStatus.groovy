/*
 * evaluateHttpStatus.groovy – script collection <REGION>_SLS_Common
 *
 * Directly after a Request-Reply whose HTTP receiver runs with "Throw Exception on Failure" off (the intake
 * call of A1–A3, the shop writes of T-7, the shop comment). The property acceptStatuses lists the codes the
 * next step handles itself (e.g. "201,409"); every other status is raised. classifyError then derives class
 * and code from errorHttpStatus and errorTarget, so the mapping of §6 lives in one place.
 */
import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props = message.getProperties()
    Integer status = toInt(message.getHeaders().get("CamelHttpResponseCode"))
    def accepted = (props.get("acceptStatuses") ?: "200,201,202,204").toString().split(",")*.trim().findAll { it }.collect { it as Integer }
    if (status == null || accepted.contains(status)) return message

    String body = (message.getBody(String) ?: "").replaceAll(/\s+/, " ").take(500)
    message.setProperty("errorHttpStatus", status.toString())
    message.setProperty("errorText", "HTTP ${status} from ${props.get('errorTarget') ?: 'target'}: ${body}".toString())
    throw new Exception("HTTP ${status}".toString())
}

static Integer toInt(Object value) {
    if (value == null) return null
    try { return value.toString().trim() as Integer } catch (ignored) { return null }
}
