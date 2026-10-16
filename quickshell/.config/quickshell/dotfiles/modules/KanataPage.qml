import QtQuick
import qs

QuickSettingsPage {
    id: root

    title: "Kanata profile"
    signal closeRequested

    Repeater {
        model: KanataService.profiles

        delegate: PageRow {
            required property var modelData

            width: root.width
            icon: modelData.icon
            label: modelData.label
            detail: modelData.detail
            current: KanataService.profile === modelData.id
            enabled: KanataService.installed && !KanataService.busy

            onClicked: {
                if (current)
                    return;
                // Let the service authorization dialog take focus.
                root.closeRequested();
                KanataService.selectProfile(modelData.id);
            }
        }
    }
}
