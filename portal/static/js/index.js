const devices = document.getElementById("devices")
const infos = document.getElementById("infos")
const form = document.getElementById("left")
const msgs = document.getElementById("msgs")
const output = document.getElementById("output")
const ipInput = document.getElementById('ipInput')
const portInput = document.getElementById('portInput')

let currentDevice = ""
let previousDevice = ""
let currentScreenshots = []

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
        infos.innerHTML = '<div class="info">    <span>Brand :</span>    <span>--</span></div><div class="info">    <span>Model :</span>    <span>--</span></div><div class="info">    <span>Manufacture :</span>    <span>--</span></div><div class="device-action"><div class="screenshot-button" onclick="takeScreenshot()" title="Take Screenshot"><img src="../img/screenshot.png" alt="Take Screenshot"><span>Take Screenshot</span></div></div>'
        updateScreenshotButton()
        output.value = "";
        updateScreenshotButton();
        if (document.getElementById('screenshots-tab').classList.contains('active')) {
            updateScreenshotsGallery([]);
        }
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
    showMsg('Build success');
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
    if (!currentDevice) {
        showMsg("Please select a device first.");
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
        const currentIndex = parseInt(modal.dataset.currentIndex) || 0;
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
    if (!currentScreenshots || currentScreenshots.length === 0) return;

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

    // Load screenshots if switching to screenshots tab
    if (tabName === 'screenshots') {
        loadScreenshots();
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
