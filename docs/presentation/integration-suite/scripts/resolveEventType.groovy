/*
 * resolveEventType.groovy – script collection <REGION>_SLS_Common
 *
 * Bridge T-4, after the AMQP sender: looks the CloudEvent type up in the value mapping <REGION>_EventTypes
 * (source agency "<REGION>_CloudEvents", identifier "type"; target agency "HYDAC", identifiers "interfacename"
 * and "entity") and sets the headers interfacename and entity, which the dispatcher T-5 and the dead-letter
 * queue use. A Content Modifier cannot read a value mapping, hence a script. An unknown type is raised as
 * PERMANENT_TECH / UNKNOWN_EVENT_TYPE and ends in the dead-letter queue, not back in Event Mesh.
 */
import com.sap.gateway.ip.core.customdev.util.Message
import com.sap.it.api.ITApiFactory
import com.sap.it.api.mapping.ValueMappingApi

def Message processData(Message message) {
    def headers = message.getHeaders()
    String region = (message.getProperties().get("region") ?: "XX").toString()
    String eventType = (headers.get("eventType") ?: "").toString()
    def vm = ITApiFactory.getApi(ValueMappingApi.class, null)

    String interfacename = eventType ? vm.getMappedValue("${region}_CloudEvents".toString(), "type", eventType, "HYDAC", "interfacename") : null
    if (!interfacename) {
        message.setProperty("errorClass", "PERMANENT_TECH")
        message.setProperty("errorCode", "UNKNOWN_EVENT_TYPE")
        message.setProperty("errorText", "no consumer mapped for event type '${eventType}' in value mapping ${region}_EventTypes".toString())
        throw new Exception("UNKNOWN_EVENT_TYPE: ${eventType}".toString())
    }
    message.setHeader("interfacename", interfacename)
    String entity = vm.getMappedValue("${region}_CloudEvents".toString(), "type", eventType, "HYDAC", "entity")
    if (entity) message.setHeader("entity", entity)
    return message
}
