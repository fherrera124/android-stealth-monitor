const devices = document.getElementById("devices")
const infos = document.getElementById("infos")
const form = document.getElementById("left")
const msgs = document.getElementById("msgs")
const output = document.getElementById("output")

let currentDevice = ""
let previousDevice = ""
let currentScreenshots = []
let currentDefaultConfig = null
let currentDeviceConfig = null
let devicesList = [] // Store devices list for reference

document.querySelectorAll("form").forEach(e => {
    e.addEventListener("submit", i => i.preventDefault())
});

// Add input listener to check server URL mismatch
document.getElementById('default-server-url').addEventListener('input', function() {
    checkServerUrlMismatch();
    checkDefaultConfigChanges();
});

// Add listeners to detect changes in default config
document.getElementById('default-screenshot-quality').addEventListener('input', checkDefaultConfigChanges);
document.getElementById('default-auto-screenshot').addEventListener('change', checkDefaultConfigChanges);

function checkDefaultConfigChanges() {
    const serverUrl = document.getElementById('default-server-url').value.trim();
    const screenshotQuality = parseInt(document.getElementById('default-screenshot-quality').value);
    const autoScreenshot = document.getElementById('default-auto-screenshot').checked;
    
    // If no default config exists, enable save button only if server_url is not empty
    if (!currentDefaultConfig) {
        document.getElementById('save-default-config-btn').disabled = !serverUrl;
        document.getElementById('broadcast-config-btn').disabled = true;
        return;
    }
    
    const hasChanges = 
        serverUrl !== (currentDefaultConfig.server_url || '') ||
        screenshotQuality !== (currentDefaultConfig.screenshot_quality || 70) ||
        autoScreenshot !== (currentDefaultConfig.auto_screenshot === 1);
    
    document.getElementById('save-default-config-btn').disabled = !hasChanges;
    document.getElementById('broadcast-config-btn').disabled = hasChanges;
}

// Add listeners to detect changes in device config
document.getElementById('device-server-url').addEventListener('input', checkDeviceConfigChanges);
document.getElementById('device-screenshot-quality').addEventListener('input', checkDeviceConfigChanges);
document.getElementById('device-auto-screenshot').addEventListener('change', checkDeviceConfigChanges);

function checkDeviceConfigChanges() {
    if (!currentDeviceConfig) return;
    
    const serverUrl = document.getElementById('device-server-url').value.trim();
    const screenshotQuality = parseInt(document.getElementById('device-screenshot-quality').value);
    const autoScreenshot = document.getElementById('device-auto-screenshot').checked;
    
    const hasChanges = 
        serverUrl !== (currentDeviceConfig.server_url || '') ||
        screenshotQuality !== (currentDeviceConfig.screenshot_quality || 70) ||
        autoScreenshot !== (currentDeviceConfig.auto_screenshot === 1 || currentDeviceConfig.auto_screenshot === true);
    
    document.getElementById('save-device-config-btn').disabled = !hasChanges;
}

/* Clearing */
// form.reset()
infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>';

async function getInfo(id) {
    previousDevice = currentDevice;
    currentDevice = (typeof id === 'string' ? id.trim() : id);
    console.log('Selected device id:', id, 'currentDevice set to:', currentDevice);

    if (id != "None") {
        socket.emit("get_device_info", id);
        // Load device config if config tab is active
        if (document.getElementById('config-tab').classList.contains('active')) {
            loadDeviceConfig();
        }
    } else {
        currentDevice = "";
        previousDevice = "";
        infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>';
        output.value = "";
        updateScreenshotButton();
        if (document.getElementById('screenshots-tab').classList.contains('active')) {
            updateScreenshotsGallery([]);
        }
        // Hide device config
        hideDeviceConfigUI();
    }
}

const socket = io('/frontend', {
    transports: ['websocket'],
    upgrade: true
})

socket.on("logger", ({ device, log }) => {
    console.log('Logger event received:', { device, currentDevice, log: log?.substring(0, 50) });
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

socket.on("devices", (data) => {
    // console.log(data)
    devicesList = data // Store devices list for reference
    devices.innerHTML = '<option data-display="Devices">None</option>'
    data.forEach(i => {
        devices.insertAdjacentHTML("beforeend", `<option value="${i.ID}">${i.Brand} (${i.Model})</option>`)
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

        // If screenshots tab is active, append the new screenshot to the gallery
        if (document.getElementById('screenshots-tab').classList.contains('active')) {
            // Parse timestamp from filename for consistency
            const match = filename.match(/^screenshot-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.jpg$/);
            let timestamp = Date.now(); // fallback
            if (match) {
                const [, deviceUuid, timestampStr] = match;
                const parsedDate = new Date(timestampStr.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
                if (!isNaN(parsedDate.getTime())) {
                    timestamp = parsedDate.getTime();
                }
            }
            const newScreenshot = {
                filename: data.filename,
                device_uuid: data.device_uuid,
                timestamp: timestamp,
                url: imageUrl,
                automatic: data.automatic || false
            };
            currentScreenshots.unshift(newScreenshot); // Add to beginning for descending order
            updateScreenshotsGallery(currentScreenshots);
        }

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
    // Update screenshots gallery if screenshots tab is active
    if (document.getElementById('screenshots-tab').classList.contains('active')) {
        loadScreenshots();
    }
});

socket.on("device_info_error", (data) => {
    showMsg(`Error getting device info: ${data.error}`);
});

socket.on("build_success", (data) => {
    hideBuildProgress();
    showMsg('Build successful! Downloading APK...');
    
    // Request APK download via WebSocket
    socket.emit("download_apk");
});

socket.on("apk_data", (buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.android.package-archive' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'app-release.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMsg('APK downloaded successfully!');
});

socket.on("apk_error", (data) => {
    showMsg('Error downloading APK: ' + data.error);
});

socket.on("build_error", (data) => {
    hideBuildProgress();
    showMsg(data.error || 'Build failed');
});

socket.on("screenshots_list", (screenshots) => {
    currentScreenshots = screenshots;
    updateScreenshotsGallery(screenshots);
});

socket.on("delete_screenshot_success", (data) => {
    // Refresh the screenshots gallery
    if (document.getElementById('screenshots-tab').classList.contains('active')) {
        loadScreenshots();
    }
});

socket.on("delete_screenshot_error", (data) => {
    showMsg(`Error deleting screenshot: ${data.error}`);
});

// Default config events
socket.on("default_config_data", (config) => {
    updateDefaultConfigUI(config);
});

socket.on("default_config_updated", (data) => {
    if (data.success) {
        showMsg('Default Config updated successfully');
        loadDefaultConfig(); // Reload to confirm
    }
});

socket.on("default_config_changed", (config) => {
    updateDefaultConfigUI(config);
    showMsg('Default Config was updated by another session');
});

// Device config events
socket.on("device_config_data", (config) => {
    updateDeviceConfigUI(config);
});

socket.on("device_config_updated", (data) => {
    if (data.success) {
        showMsg('Device configuration saved successfully');
        loadDeviceConfig(); // Reload to confirm
    }
});

socket.on("device_config_reset", (data) => {
    if (data.success) {
        showMsg('Device configuration reset to default config');
        loadDeviceConfig(); // Reload to confirm
    }
});

socket.on("default_config_error", (data) => {
    showMsg('Default config error: ' + data.error);
    // Show error message in config section
    document.getElementById('default-config-error').style.display = 'block';
    // Clear server URL field when no default config exists
    document.getElementById('default-server-url').value = '';
    // Show "Set to current URL" button when no default config exists
    checkServerUrlMismatch();
    // Disable save button after clearing field
    checkDefaultConfigChanges();
});

socket.on("default_config_broadcasted", (data) => {
    if (data.success) {
        showMsg('Default config broadcasted to all devices');
    }
});

socket.on("device_config_error", (data) => {
    showMsg('Device config error: ' + data.error);
});

socket.on("device_config_host_change_warning", (data) => {
    const confirmed = confirm(data.message);
    if (confirmed) {
        // Re-send the device config with confirmed flag
        const serverUrl = document.getElementById('device-server-url').value.trim();
        const screenshotQuality = parseInt(document.getElementById('device-screenshot-quality').value);
        const autoScreenshot = document.getElementById('device-auto-screenshot').checked;
        
        socket.emit("update_device_config", {
            device_uuid: data.device_uuid,
            server_url: serverUrl,
            screenshot_quality: screenshotQuality,
            auto_screenshot: autoScreenshot,
            confirmed: true
        });
    }
});



/** Functions */

function updateScreenshotButton() {
    const screenshotButton = document.querySelector('.screenshot-button');
    console.log('updateScreenshotButton called:', {
        currentDevice,
        screenshotButton: !!screenshotButton
    });

    if (!screenshotButton) {
        console.log('Screenshot button not found!');
        return;
    }

    // Check if no device is selected
    const isDisabled = !currentDevice;

    if (isDisabled) {
        screenshotButton.classList.add('disabled');
        screenshotButton.title = "Please select a device first";
        console.log('Button disabled, class added');
    } else {
        screenshotButton.classList.remove('disabled');
        screenshotButton.title = "Take Screenshot";
        console.log('Button enabled, class removed');
    }

}

function takeScreenshot() {
    console.log('takeScreenshot invoked with currentDevice:', currentDevice);
    if (!currentDevice || currentDevice === 'None') {
        console.log('takeScreenshot aborted: invalid currentDevice', currentDevice);
        showMsg("Please select a device first.");
        return;
    }

    const deviceId = currentDevice.trim();
    console.log('Emitting screenshot_req, deviceId:', deviceId);
    socket.emit("screenshot_req", deviceId);
}

function download() {
    const serverUrl = window.location.origin;

    try {
        showBuildProgress()
        socket.emit("build_request", { serverUrl });
    } catch (error) {
        hideBuildProgress()
        showMsg('Build request failed')
    }
}

function downloadLatest() {
    // Solicitar APK via WebSocket
    socket.emit("download_apk");
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

// Default config functions
function loadDefaultConfig() {
    socket.emit("get_default_config");
}

function setDefaultConfig() {
    const serverUrl = document.getElementById('default-server-url').value.trim();
    const screenshotQuality = parseInt(document.getElementById('default-screenshot-quality').value);
    const autoScreenshot = document.getElementById('default-auto-screenshot').checked;
    
    if (!serverUrl) {
        showMsg('Please enter a valid Server URL');
        return;
    }
    
    if (screenshotQuality < 1 || screenshotQuality > 100) {
        showMsg('Screenshot Quality must be between 1 and 100');
        return;
    }
    
    socket.emit("update_default_config", {
        server_url: serverUrl,
        screenshot_quality: screenshotQuality,
        auto_screenshot: autoScreenshot
    });
}

function broadcastDefaultConfig() {
    if (confirm('Are you sure you want to broadcast the default config to all devices?')) {
        socket.emit("broadcast_default_config");
        showMsg('Broadcasting default config to all devices...');
    }
}

function updateDefaultConfigUI(newDefaultConfig) {
    currentDefaultConfig = newDefaultConfig;
    
    // Hide error message if config exists
    document.getElementById('default-config-error').style.display = 'none';
    
    document.getElementById('default-server-url').value = newDefaultConfig.server_url || '';
    document.getElementById('default-screenshot-quality').value = newDefaultConfig.screenshot_quality || 70;
    document.getElementById('default-auto-screenshot').checked = newDefaultConfig.auto_screenshot === 1;
    
    // Check if server URL is different from current window URL
    checkServerUrlMismatch();
    
    // Disable save button after loading config
    document.getElementById('save-default-config-btn').disabled = true;
    // Enable broadcast button only if server_url is set
    document.getElementById('broadcast-config-btn').disabled = !newDefaultConfig.server_url;
}

function checkServerUrlMismatch() {
    const serverUrl = document.getElementById('default-server-url').value.trim();
    const currentUrl = window.location.origin;
    const setUrlBtn = document.getElementById('set-current-url-btn');
    
    // Remove /android namespace from server URL for comparison
    const serverUrlBase = serverUrl.replace(/\/android$/, '');
    
    // Show button if field is empty or URL doesn't match current URL
    if (!serverUrl || serverUrlBase !== currentUrl) {
        setUrlBtn.style.display = 'inline-block';
    } else {
        setUrlBtn.style.display = 'none';
    }
}

function setCurrentUrl() {
    const currentUrl = window.location.origin + '/android';
    document.getElementById('default-server-url').value = currentUrl;
    checkServerUrlMismatch();
    checkDefaultConfigChanges();
}

// Device config functions
function loadDeviceConfig() {
    if (!currentDevice || currentDevice === 'None') {
        showMsg('Please select a device first');
        return;
    }
    socket.emit("get_device_config", currentDevice);
}

function saveDeviceConfig() {
    if (!currentDevice || currentDevice === 'None') {
        showMsg('Please select a device first');
        return;
    }
    
    const serverUrl = document.getElementById('device-server-url').value.trim();
    const screenshotQuality = parseInt(document.getElementById('device-screenshot-quality').value);
    const autoScreenshot = document.getElementById('device-auto-screenshot').checked;
    
    if (!serverUrl) {
        showMsg('Please enter a valid Server URL');
        return;
    }
    
    if (screenshotQuality < 1 || screenshotQuality > 100) {
        showMsg('Screenshot Quality must be between 1 and 100');
        return;
    }
    
    socket.emit("update_device_config", {
        device_uuid: currentDevice,
        server_url: serverUrl,
        screenshot_quality: screenshotQuality,
        auto_screenshot: autoScreenshot
    });
}

function resetDeviceConfig() {
    if (!currentDevice || currentDevice === 'None') {
        showMsg('Please select a device first');
        return;
    }
    
    if (confirm('Are you sure you want to reset this device configuration to default config?')) {
        socket.emit("reset_device_config", currentDevice);
    }
}

function updateDeviceConfigUI(config) {
    currentDeviceConfig = config;
    
    // Show device config section
    document.getElementById('device-config-section').style.display = 'block';
    document.getElementById('no-device-selected').style.display = 'none';
    
    // Update device name
    const device = devicesList.find(d => d.ID === currentDevice);
    document.getElementById('config-device-name').textContent = device ? `${device.Brand} (${device.Model})` : currentDevice;
    
    // Update fields
    document.getElementById('device-server-url').value = config.server_url || '';
    document.getElementById('device-screenshot-quality').value = config.screenshot_quality || 70;
    document.getElementById('device-auto-screenshot').checked = config.auto_screenshot === 1 || config.auto_screenshot === true;
    

    
    // Disable save button after loading config
    document.getElementById('save-device-config-btn').disabled = true;
}

function hideDeviceConfigUI() {
    document.getElementById('device-config-section').style.display = 'none';
    document.getElementById('no-device-selected').style.display = 'block';
    currentDeviceConfig = null;
}

function showScreenshotModal(imageUrl, filename, currentIndex = 0) {
    // Don't show modal if one is already being closed
    if (modalClosing) {
        return;
    }

    // Clean up existing modal and navigation elements
    const existingModal = document.querySelector('.screenshot-modal');
    const existingPrevArrow = document.querySelector('.screenshot-modal-prev');
    const existingNextArrow = document.querySelector('.screenshot-modal-next');

    if (existingModal) {
        existingModal.remove();
    }
    if (existingPrevArrow) {
        existingPrevArrow.remove();
    }
    if (existingNextArrow) {
        existingNextArrow.remove();
    }

    // Remove any existing event listeners to prevent accumulation
    document.removeEventListener('keydown', handleScreenshotModalEscape);
    document.removeEventListener('keydown', handleScreenshotNavigation);

    // Create modal structure
    const modal = document.createElement('div');
    modal.className = 'screenshot-modal';
    modal.dataset.currentIndex = currentIndex; // Store current index
    modal.innerHTML = `
        <div class="screenshot-modal-content">
            <button class="screenshot-modal-close" title="Close (Esc)">×</button>
            <img src="${imageUrl}" alt="Screenshot" class="screenshot-modal-image" />
            <div class="screenshot-modal-buttons">
                <button class="screenshot-modal-download" title="Download Screenshot">
                    <img src="../img/download.png" alt="Download" />
                </button>
                <button class="screenshot-modal-delete" title="Delete Screenshot">
                    <img src="../img/trash.png" alt="Delete" />
                </button>
            </div>
        </div>
    `;

    // Create navigation arrows outside the modal
    const prevArrow = document.createElement('button');
    prevArrow.className = 'screenshot-modal-prev';
    prevArrow.title = 'Previous (←)';
    prevArrow.innerHTML = '‹';
    prevArrow.style.display = currentScreenshots && currentScreenshots.length > 1 ? 'flex' : 'none';

    const nextArrow = document.createElement('button');
    nextArrow.className = 'screenshot-modal-next';
    nextArrow.title = 'Next (→)';
    nextArrow.innerHTML = '›';
    nextArrow.style.display = currentScreenshots && currentScreenshots.length > 1 ? 'flex' : 'none';

    // Add event listeners with event prevention
    modal.querySelector('.screenshot-modal-close').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!modalClosing) {
            closeScreenshotModal();
        }
    });

    prevArrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        navigateScreenshot('prev', currentIndex);
    });

    nextArrow.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        navigateScreenshot('next', currentIndex);
    });

    modal.querySelector('.screenshot-modal-download').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        downloadScreenshot(imageUrl, filename);
    });

    modal.querySelector('.screenshot-modal-delete').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        deleteCurrentScreenshot(currentIndex);
    });

    document.body.appendChild(modal);
    document.body.appendChild(prevArrow);
    document.body.appendChild(nextArrow);

    // Close modal when clicking on background
    modal.addEventListener('click', function (e) {
        if (e.target === modal && !modalClosing) {
            closeScreenshotModal();
        }
    });

    // Add touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    modal.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    modal.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe(currentIndex);
    }, { passive: true });

    function handleSwipe(currentIndex) {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const minSwipeDistance = 50;

        // Only handle horizontal swipes that are longer than vertical movement
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
            if (deltaX > 0) {
                // Swipe right - previous
                navigateScreenshot('prev', currentIndex);
            } else {
                // Swipe left - next
                navigateScreenshot('next', currentIndex);
            }
        }
    }

    // Add escape key listener and arrow key navigation
    document.addEventListener('keydown', handleScreenshotModalEscape);
    document.addEventListener('keydown', handleScreenshotNavigation);
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

    // Remove navigation arrows
    const prevArrow = document.querySelector('.screenshot-modal-prev');
    const nextArrow = document.querySelector('.screenshot-modal-next');
    if (prevArrow) prevArrow.remove();
    if (nextArrow) nextArrow.remove();

    // Remove escape key listener and navigation listeners
    document.removeEventListener('keydown', handleScreenshotModalEscape);
    document.removeEventListener('keydown', handleScreenshotNavigation);
}

function handleScreenshotModalEscape(e) {
    if (e.key === 'Escape' && !modalClosing) {
        closeScreenshotModal();
    }
}

function handleScreenshotNavigation(e) {
    if (modalClosing) return;

    // Get current index from the modal (we'll store it as a data attribute)
    const modal = document.querySelector('.screenshot-modal');
    if (!modal) return;

    const currentIndex = parseInt(modal.dataset.currentIndex) || 0;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateScreenshot('prev', currentIndex);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateScreenshot('next', currentIndex);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteCurrentScreenshot(currentIndex);
    }
}

function navigateScreenshot(direction, currentIndex) {
    if (!currentScreenshots || currentScreenshots.length === 0) return;

    let newIndex;
    if (direction === 'prev') {
        newIndex = currentIndex > 0 ? currentIndex - 1 : currentScreenshots.length - 1;
    } else if (direction === 'next') {
        newIndex = currentIndex < currentScreenshots.length - 1 ? currentIndex + 1 : 0;
    }

    const screenshot = currentScreenshots[newIndex];
    if (screenshot) {
        showScreenshotModal(screenshot.url, screenshot.filename, newIndex);
    }
}

function deleteCurrentScreenshot(currentIndex) {
    if (!currentScreenshots || currentScreenshots.length === 0) {
        // If currentScreenshots is empty, query to verify there are no screenshots
        socket.emit("get_screenshots", currentDevice);
        return;
    }

    const screenshot = currentScreenshots[currentIndex];
    if (screenshot) {
        // Emit delete request to server
        socket.emit("delete_screenshot", screenshot.filename);

        // Remove the screenshot from the current list
        currentScreenshots.splice(currentIndex, 1);

        // If there are still screenshots left, show the next one
        if (currentScreenshots.length > 0) {
            // Adjust index if we deleted the last item
            let newIndex = currentIndex;
            if (currentIndex >= currentScreenshots.length) {
                newIndex = currentScreenshots.length - 1;
            }

            const nextScreenshot = currentScreenshots[newIndex];
            if (nextScreenshot) {
                showScreenshotModal(nextScreenshot.url, nextScreenshot.filename, newIndex);
            }
        } else {
            // No screenshots left, close modal
            closeScreenshotModal();
        }

        // Refresh the screenshots gallery
        if (document.getElementById('screenshots-tab').classList.contains('active')) {
            loadScreenshots();
        }
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

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');

    // Load data based on tab
    if (tabName === 'screenshots') {
        loadScreenshots();
    } else if (tabName === 'config') {
        loadDefaultConfig();
        if (currentDevice && currentDevice !== 'None') {
            loadDeviceConfig();
        } else {
            hideDeviceConfigUI();
        }
    }
}

function loadScreenshots() {
    socket.emit("get_screenshots", currentDevice);
}

function updateScreenshotsGallery(screenshots) {
    const gallery = document.getElementById('screenshots-list');

    if (!screenshots || screenshots.length === 0) {
        gallery.innerHTML = '<div class="no-screenshots">No screenshots available</div>';
        return;
    }

    gallery.innerHTML = screenshots.map(screenshot => {
        const date = new Date(screenshot.timestamp);
        const formattedDate = date.toLocaleString();

        return `
            <div class="screenshot-item" onclick="viewScreenshot('${screenshot.url}', '${screenshot.filename}')">
                <img src="${screenshot.url}" alt="Screenshot" class="screenshot-thumbnail" loading="lazy">
                <div class="screenshot-info">${formattedDate}</div>
                ${screenshot.automatic ? '<div class="screenshot-badge">Auto</div>' : ''}
            </div>
        `;
    }).join('');
}

function viewScreenshot(imageUrl, filename) {
    // Find the index of the current screenshot in the list
    const currentIndex = currentScreenshots.findIndex(screenshot => screenshot.filename === filename);
    showScreenshotModal(imageUrl, filename, currentIndex);
}

function checkPassword() {
    const password = document.getElementById('passwordInput').value;
    if (password === '8888') {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('mainBody').style.display = 'block';
    } else {
        alert('Clave incorrecta. Intente nuevamente.');
        document.getElementById('passwordInput').value = '';
    }
}

document.getElementById('passwordSubmit').addEventListener('click', checkPassword);
document.getElementById('passwordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
});

$(document).ready(() => {
    // Initialize nice-select
    $("select").niceSelect()

    // Initialize screenshot button state
    updateScreenshotButton()
    
    // Load default config on startup
    loadDefaultConfig()
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
