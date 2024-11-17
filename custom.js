(function () {

    const { fetchFile } = FFmpegUtil;
    const { FFmpeg } = FFmpegWASM;
    let ffmpeg = null;


    const ALLOWED_FORMATS = {
        'video/mp4': '.mp4'
    };

    // Store processed videos
    const processedVideos = new Map(); // key: file name, value: { tsFile, duration, thumbnail }

    const processingQueue = new Map();

    const dragZone = document.getElementById('dragZone');
    const fileInput = document.getElementById('fileInput');
    const videoList = document.getElementById('videoList');
    const mergeBtn = document.getElementById('mergeBtn');

    let sortable;

    // Add loading state management
    let isFFmpegLoaded = false;

    // Update drag zone to show loading state

    function updateDragZoneState(isLoading) {
        const dragZone = document.getElementById('dragZone');
        if (!dragZone) return;

        const loadingText = 'Loading video processor... Please wait.';
        const defaultText = 'Drag and drop video files here<br>or click to select files';

        if (isLoading) {
            dragZone.classList.add('loading');
            dragZone.querySelector('p').innerHTML = loadingText;
            dragZone.style.pointerEvents = 'none';
        } else {
            dragZone.classList.remove('loading');
            dragZone.querySelector('p').innerHTML = defaultText;
            dragZone.style.pointerEvents = 'auto';
        }
    }
    // Initialize FFmpeg first when page loads
    document.addEventListener('DOMContentLoaded', async () => {
        await initFFmpeg();
    });


    async function initFFmpeg() {
        try {
            // Show loading state
            updateDragZoneState(true);

            if (!ffmpeg) {
                ffmpeg = new FFmpeg();
                ffmpeg.on("log", ({ message }) => {
                    console.log(message);
                });

                const basePath = window.location.pathname.includes('ad-hopper')
                    ? '/ad-hopper'
                    : '';

                console.log('Loading FFmpeg...');
                await ffmpeg.load({
                    coreURL: `${basePath}/assets/core/package/dist/umd/ffmpeg-core.js`,
                });
                console.log('FFmpeg loaded successfully');

                isFFmpegLoaded = true;
            }

            // Enable drag zone only after successful load
            updateDragZoneState(false);
            showToast('Video processor ready!', 'success');
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            isFFmpegLoaded = false;
            showToast('Failed to initialize video processor. Please refresh the page.', 'error');
            updateDragZoneState(false);
        }

        // Initialize Sortable only once
        if (!sortable) {
            sortable = new Sortable(videoList, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                forceFallback: true,
                fallbackOnBody: true,

                onStart: function (evt) {
                    videoList.classList.add('dragging');
                    gridOverlay.style.display = 'block';
                    updatePositionNumbers();
                },

                onMove: function (evt) {
                    const items = Array.from(videoList.children);
                    const newPos = evt.related ? items.indexOf(evt.related) + 1 : items.length;

                    positionTooltip.textContent = `Moving to position ${newPos}`;
                    positionTooltip.style.display = 'block';
                    positionTooltip.style.left = evt.originalEvent.pageX + 10 + 'px';
                    positionTooltip.style.top = evt.originalEvent.pageY + 10 + 'px';

                    if (evt.related) {
                        evt.related.style.transform = 'scale(1.02)';
                    }
                },

                onEnd: function (evt) {
                    videoList.classList.remove('dragging');
                    gridOverlay.style.display = 'none';
                    positionTooltip.style.display = 'none';
                    updatePositionNumbers();

                    Array.from(videoList.children).forEach(item => {
                        item.style.transform = '';
                    });
                    // Important: Update processed videos order
                    const newOrder = new Map();
                    Array.from(videoList.children)
                        .filter(item => item.classList.contains('video-item'))
                        .forEach(item => {
                            const filename = item.querySelector('.video-title').textContent;
                            const fileInfo = processedVideos.get(filename);
                            if (fileInfo) {
                                newOrder.set(filename, fileInfo);
                            }
                        });

                    // Replace the old map with new ordered map
                    processedVideos.clear();
                    newOrder.forEach((value, key) => {
                        processedVideos.set(key, value);
                    });

                    console.log('Updated video order:', Array.from(processedVideos.keys()));

                },

                onChange: function (evt) {
                    updatePositionNumbers();
                }
            });
        }
    }
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.maxWidth = '400px'; // Limit toast width
        toast.style.wordBreak = 'break-word'; // Allow long messages to wrap
        toast.textContent = message;

        const container = document.getElementById('toastContainer');
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s forwards';
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, duration);
    }


    function isValidVideoFormat(file) {
        // Check MIME type
        if (!ALLOWED_FORMATS[file.type]) {
            return {
                valid: false,
                reason: `Invalid format: ${file.type || 'unknown'}. Only MP4 files are supported.`
            };
        }

        // Check file extension
        const extension = file.name.toLowerCase().split('.').pop();
        if (extension !== 'mp4') {
            return {
                valid: false,
                reason: `Invalid file extension: .${extension}. Only .mp4 files are supported.`
            };
        }

        return {
            valid: true
        };
    }



    dragZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragZone.classList.add('drag-over');
    });

    dragZone.addEventListener('dragleave', () => {
        dragZone.classList.remove('drag-over');
    });

    dragZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragZone.classList.remove('drag-over');

        if (!isFFmpegLoaded) {
            showToast('Please wait for video processor to initialize', 'warning');
            return;
        }

        const files = Array.from(e.dataTransfer.files);
        const invalidFiles = files.filter(file => !isValidVideoFormat(file).valid);

        if (invalidFiles.length > 0) {
            showToast('Only MP4 files are supported', 'error');
            // Still process any valid files that were dropped
            await handleFiles(files);
            return;
        }

        await handleFiles(files);
    });

    dragZone.addEventListener('click', (e) => {
        if (!isFFmpegLoaded) {
            e.preventDefault();
            showToast('Please wait for video processor to initialize', 'warning');
            return;
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        await handleFiles(fileInput.files);
        fileInput.value = ''; // Reset input to allow selecting the same file again
    });

    async function handleFiles(files) {
        if (!isFFmpegLoaded || !ffmpeg) {
            showToast('Video processor is not ready yet. Please wait.', 'warning');
            return;
        }

        // Pre-validation checks before adding to UI
        for (const file of Array.from(files)) {
            try {
                // Check format first
                const formatCheck = VideoValidator.checkFormat(file);
                if (!formatCheck.valid) {
                    showToast(formatCheck.reason, 'error');
                    continue;
                }

                // Check file size
                const sizeCheck = VideoValidator.checkFileSize(file);
                if (!sizeCheck.valid) {
                    showToast(sizeCheck.reason, 'error');
                    continue;
                }

                // Check for duplicates
                const duplicateCheck = VideoValidator.checkDuplicate(file.name, processedVideos);
                if (!duplicateCheck.valid) {
                    showToast(duplicateCheck.reason, 'warning');
                    continue;
                }

                // Create temporary video element for duration check
                const video = document.createElement('video');
                video.preload = 'metadata';

                await new Promise((resolve, reject) => {
                    video.onloadedmetadata = () => resolve();
                    video.onerror = () => reject(new Error('Failed to load video metadata'));
                    video.src = URL.createObjectURL(file);
                });

                // Check individual duration
                const durationCheck = VideoValidator.checkDuration(video.duration, file.name);
                if (!durationCheck.valid) {
                    showToast(durationCheck.reason, 'error');
                    continue;
                }

                // Check total duration
                const totalDurationCheck = VideoValidator.checkTotalDuration(
                    Array.from(processedVideos.values()),
                    video.duration
                );
                if (!totalDurationCheck.valid) {
                    showToast(totalDurationCheck.reason, 'error');
                    continue;
                }

                // If all checks pass, create video item and start processing
                const videoItem = createVideoItem(file);
                videoList.appendChild(videoItem);
                videoItem.classList.add('processing');

                try {
                    await processVideo(file, videoItem);
                    showToast(`Successfully processed ${file.name}`, 'success');
                } catch (processingError) {
                    await handleProcessingError(processingError, file, videoItem);
                }

            } catch (error) {
                showToast(`Error with ${file.name}: ${error.message}`, 'error');
            }
        }

        updateMergeButton();
    }

    async function handleProcessingError(error, file, videoItem) {
        console.error(`Error processing ${file.name}:`, error);

        // Clear any existing processing state
        videoItem.classList.remove('processing', 'placeholder');
        videoItem.classList.add('error');

        // Update progress bar to show error state
        const progressBar = videoItem.querySelector('.progress-bar-fill');
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = '#e74c3c';
        }

        // Get the error message to display
        let errorMessage;
        if (error.message.includes('duration too long')) {
            errorMessage = `${file.name}: Video exceeds 60 seconds limit`;
            // Update the error overlay text
            const thumbnail = videoItem.querySelector('.video-thumbnail');
            if (thumbnail) {
                thumbnail.setAttribute('data-error', 'Video exceeds 60 seconds limit');
            }
        }
        else if (error.message.includes('Total duration would exceed')) {
            errorMessage = `${file.name}: Cannot add - total duration would exceed 3 minutes`;
            // Remove the item from the list as it won't be used
            videoItem.remove();
        }
        else if (error.message === 'Processing aborted') {
            errorMessage = `Processing cancelled for ${file.name}`;
        }
        else if (error.message === 'Failed to load video metadata' ||
            error.message === 'Video load timeout') {
            errorMessage = `${file.name} appears to be corrupt or invalid`;
        }
        else {
            errorMessage = `Error processing ${file.name}: ${error.message}`;
        }

        // Show toast with specific error
        showToast(errorMessage, 'error');

        // Clean up processing data
        processedVideos.delete(file.name);
        processingQueue.delete(file.name);
    }

    function createVideoItem(file) {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.draggable = true;
        item.dataset.filename = file.name;

        // Position will be set by updatePositionNumbers()
        item.innerHTML = `
    <div class="video-thumbnail">
        <video></video>
        <button class="delete-btn">×</button>
        <button class="retry-btn">Retry</button>
    </div>
    <div class="video-info">
        <h3 class="video-title">${file.name}</h3>
        <div class="video-duration"></div>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: 0%"></div>
        </div>
    </div>
    `;

        // Setup delete button
        item.querySelector('.delete-btn').addEventListener('click', () => {
            const queueItem = processingQueue.get(file.name);
            if (queueItem) {
                queueItem.abort = true;
            }
            processedVideos.delete(file.name);
            item.remove();
            updatePositionNumbers(); // Update numbers after removing item
            updateMergeButton();
        });

        // Setup retry button... (rest remains the same)
        return item;
    }

    async function processVideo(file, videoItem) {
        const progressBar = videoItem.querySelector('.progress-bar-fill');
        const video = videoItem.querySelector('video');
        const queueItem = processingQueue.get(file.name);

        try {
            // Create video preview
            const videoUrl = URL.createObjectURL(file);
            video.src = videoUrl;

            // Add error handling for video loading
            await new Promise((resolve, reject) => {
                video.addEventListener('loadedmetadata', resolve);
                video.addEventListener('error', () => reject(new Error('Failed to load video metadata')));
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });

            if (queueItem?.abort) {
                throw new Error('Processing aborted');
            }

            // Validate video duration and dimensions
            if (video.duration === 0 || video.duration === Infinity) {
                throw new Error('Invalid video duration');
            }

            if (video.videoWidth === 0 || video.videoHeight === 0) {
                throw new Error('Invalid video dimensions');
            }

            const duration = video.duration;
            const width = video.videoWidth;
            const height = video.videoHeight;

            videoItem.querySelector('.video-duration').textContent =
                `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`;

            const sanitizedName = sanitizeFileName(file.name);
            const inputName = `input_${sanitizedName}`;
            const tsName = `temp_${sanitizedName}.ts`;

            console.log(`Processing ${file.name} as ${tsName}`);

            await ffmpeg.writeFile(inputName, await fetchFile(file));

            if (queueItem?.abort) {
                throw new Error('Processing aborted');
            }

            // Check for audio using HTMLVideoElement
            const hasAudio = video.mozHasAudio ||
                Boolean(video.webkitAudioDecodedByteCount) ||
                Boolean(video.audioTracks && video.audioTracks.length);

            console.log(`Video ${file.name} has audio: ${hasAudio}`);

            const needsVideoConversion = width !== 1280 || height !== 720;

            try {
                if (!needsVideoConversion) {
                    if (hasAudio) {
                        // Video size is correct and has audio
                        await ffmpeg.exec([
                            '-i', inputName,
                            '-c:v', 'copy',
                            '-c:a', 'aac',
                            '-ac', '2',
                            '-ar', '44100',
                            '-b:a', '128k',
                            '-bsf:v', 'h264_mp4toannexb',
                            '-f', 'mpegts',
                            tsName
                        ]);
                    } else {
                        // Video size is correct but no audio - add silent audio
                        await ffmpeg.exec([
                            '-i', inputName,
                            '-f', 'lavfi',
                            '-i', 'anullsrc=r=44100:cl=stereo',
                            '-c:v', 'copy',
                            '-c:a', 'aac',
                            '-ac', '2',
                            '-ar', '44100',
                            '-b:a', '128k',
                            '-shortest',
                            '-bsf:v', 'h264_mp4toannexb',
                            '-f', 'mpegts',
                            tsName
                        ]);
                    }
                } else {
                    if (hasAudio) {
                        // Need to resize video and has audio
                        await ffmpeg.exec([
                            '-i', inputName,
                            '-vf', 'scale=1280:720:force_original_aspect_ratio=1,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
                            '-c:v', 'libx264',
                            '-profile:v', 'main',
                            '-preset', 'ultrafast',
                            '-c:a', 'aac',
                            '-ac', '2',
                            '-ar', '44100',
                            '-b:a', '128k',
                            '-bsf:v', 'h264_mp4toannexb',
                            '-f', 'mpegts',
                            tsName
                        ]);
                    } else {
                        // Need to resize video and no audio - add silent audio
                        await ffmpeg.exec([
                            '-i', inputName,
                            '-f', 'lavfi',
                            '-i', 'anullsrc=r=44100:cl=stereo',
                            '-vf', 'scale=1280:720:force_original_aspect_ratio=1,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
                            '-c:v', 'libx264',
                            '-profile:v', 'main',
                            '-preset', 'ultrafast',
                            '-c:a', 'aac',
                            '-ac', '2',
                            '-ar', '44100',
                            '-b:a', '128k',
                            '-shortest',
                            '-bsf:v', 'h264_mp4toannexb',
                            '-f', 'mpegts',
                            tsName
                        ]);
                    }
                }
            } catch (ffmpegError) {
                throw new Error('Failed to process video: ' + ffmpegError.message);
            }

            processedVideos.set(file.name, {
                tsFile: tsName,
                duration: duration,
                thumbnail: videoUrl,
                dimensions: { width, height },
                hasAudio: true  // Since we now ensure all videos have audio (original or silent)
            });

            progressBar.style.width = '100%';
            progressBar.parentElement.classList.add('processing');
            videoItem.classList.remove('processing');

        } catch (error) {
            throw error;
        }
    }



    function calculateEstimatedTime(fileSize, needsVideoConversion) {
        // Base processing time in milliseconds
        const baseTime = 2000;
        // Additional time based on file size (1 second per 5MB)
        const sizeTime = (fileSize / (5 * 1024 * 1024)) * 1000;
        // Additional time if video conversion is needed
        const conversionTime = needsVideoConversion ? 5000 : 0;

        return baseTime + sizeTime + conversionTime;
    }

    // Add position tooltip element
    const positionTooltip = document.createElement('div');
    positionTooltip.className = 'position-tooltip';
    document.body.appendChild(positionTooltip);

    // Add grid overlay element
    const gridOverlay = document.createElement('div');
    gridOverlay.className = 'grid-overlay';
    videoList.appendChild(gridOverlay);

    function setupDragAndDrop() {
        const sortable = new Sortable(videoList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            forceFallback: true,
            fallbackOnBody: true,

            // Show grid and update indicators when drag starts
            onStart: function (evt) {
                videoList.classList.add('dragging');
                gridOverlay.style.display = 'block';
                updatePositionNumbers();
            },

            // Update position tooltip during drag
            onMove: function (evt) {
                const items = Array.from(videoList.children);
                const currentPos = items.indexOf(evt.dragged) + 1;
                const newPos = items.indexOf(evt.related) + 1;

                positionTooltip.textContent = `Moving to position ${newPos}`;
                positionTooltip.style.display = 'block';
                positionTooltip.style.left = evt.originalEvent.pageX + 10 + 'px';
                positionTooltip.style.top = evt.originalEvent.pageY + 10 + 'px';

                // Highlight drop target area
                evt.related.style.transform = 'scale(1.02)';
            },

            // Clean up after drag
            onEnd: function (evt) {
                videoList.classList.remove('dragging');
                gridOverlay.style.display = 'none';
                positionTooltip.style.display = 'none';
                updatePositionNumbers();

                // Reset any transformations
                Array.from(videoList.children).forEach(item => {
                    item.style.transform = '';
                });
            },

            // Handle drop completion
            onChange: function (evt) {
                updatePositionNumbers();
            }
        });

        return sortable;
    }

    // Update position numbers correctly
    function updatePositionNumbers() {
        const items = Array.from(videoList.children);
        items.forEach((item, index) => {
            item.setAttribute('data-position', index);
        });
    }


    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.video-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateMergeButton() {
        const allVideos = Array.from(videoList.children);
        const hasErrors = allVideos.some(item => item.classList.contains('error'));
        const isProcessing = allVideos.some(item =>
            item.classList.contains('processing') ||
            item.classList.contains('placeholder')
        );
        const validVideoCount = processedVideos.size;

        let tooltipText = 'Add at least 2 videos to merge';

        if (hasErrors) {
            mergeBtn.disabled = true;
            tooltipText = 'Remove failed videos before merging';
        } else if (isProcessing) {
            mergeBtn.disabled = true;
            tooltipText = 'Wait for all videos to finish processing';
        } else if (validVideoCount < 2) {
            mergeBtn.disabled = true;
            tooltipText = 'Add at least 2 videos to merge';
        } else {
            mergeBtn.disabled = false;
            tooltipText = 'Click to merge videos';
        }

        // Update the button's data attribute instead of directly manipulating the tooltip
        mergeBtn.setAttribute('data-tooltip', tooltipText);

        // If tooltip is visible, update its content
        const tooltip = mergeBtn.parentElement.querySelector('.merge-tooltip');
        if (tooltip) {
            tooltip.textContent = tooltipText;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {

        const mergeBtn = document.getElementById('mergeBtn');
        const tooltipContainer = mergeBtn.parentElement.querySelector('.merge-tooltip');

        if (mergeBtn && tooltipContainer) {
            mergeBtn.addEventListener('mouseenter', () => {
                tooltipContainer.textContent = mergeBtn.getAttribute('data-tooltip');
            });
        }
    });

    function sanitizeFileName(filename) {
        return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    }


    mergeBtn.addEventListener('click', async () => {
        if (processedVideos.size < 2) return;

        try {
            mergeBtn.disabled = true;
            mergeBtn.textContent = 'Merging videos...';
            showToast('Starting video merge process...', 'info');

            const videoItems = Array.from(videoList.children).filter(item =>
                item.classList.contains('video-item')
            );

            console.log('Found video items:', videoItems.length);

            const orderedFiles = videoItems.map((item, index) => {
                const titleElement = item.querySelector('.video-title');
                if (!titleElement) {
                    throw new Error(`Missing title element for video at position ${index + 1}`);
                }

                const filename = titleElement.textContent;
                const fileInfo = processedVideos.get(filename);
                if (!fileInfo || !fileInfo.tsFile) {
                    throw new Error(`Missing processed data for "${filename}"`);
                }

                return fileInfo.tsFile;
            });

            console.log('Merging files in order:', orderedFiles);

            // Join files with pipe for FFmpeg
            const fileList = orderedFiles.join('|');
            console.log('Merge command:', [
                '-i', `concat:${fileList}`,
                '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc',
                '-y',
                'output.mp4'
            ].join(' '));

            // Execute merge command
            await ffmpeg.exec([
                '-i', `concat:${fileList}`,
                '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc',
                '-y',
                'output.mp4'
            ]);

            // Check output file
            const data = await ffmpeg.readFile('output.mp4');
            if (!data || data.length === 0) {
                throw new Error('Failed to generate output file');
            }

            console.log(`Output file size: ${(data.length / (1024 * 1024)).toFixed(2)} MB`);


            // Generate output filename with timings
            const videos = Array.from(processedVideos.values());
            const outputFilename = OutputFileGenerator.generate(videos);


            // Create and download the file
            const blob = new Blob([data], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = outputFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Only delete the output file, keep the .ts files
            await ffmpeg.deleteFile('output.mp4');
            showToast('Videos merged successfully!', 'success');

        } catch (error) {
            console.error('Error merging videos:', error);
            showToast(`Error merging videos: ${error.message}`, 'error');
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge Videos';
        }
    });

    // Add the JavaScript handler
    document.getElementById('clearBtn').addEventListener('click', async () => {
        try {
            // Clear all videos from UI
            videoList.innerHTML = '';

            // Clean up all temporary files
            for (const [filename, fileInfo] of processedVideos) {
                if (fileInfo.tsFile) {
                    await ffmpeg.deleteFile(fileInfo.tsFile);
                }
            }

            // Clear all data structures
            processedVideos.clear();
            processingQueue.clear();

            // Reset merge button
            updateMergeButton();

            showToast('All videos cleared', 'success');
        } catch (error) {
            console.error('Error clearing videos:', error);
            showToast('Error clearing some files', 'error');
        }
    });


    // Add a cleanup function for when video is removed
    function deleteVideo(filename) {
        const fileInfo = processedVideos.get(filename);
        if (fileInfo && fileInfo.tsFile) {
            ffmpeg.deleteFile(fileInfo.tsFile).catch(console.error);
        }
        processedVideos.delete(filename);
    }


    // Update the VideoValidator configuration
    const VideoValidator = {
        // Configuration with your specific requirements
        config: {
            // Total output limit
            totalMaxDuration: 180, // 3 minutes in seconds

            // Per-file duration limits
            minDuration: 10,  // Changed from 3 to 10 seconds minimum
            maxDuration: 61,  // 60 seconds maximum per file

            // File size limits
            maxFileSize: 10 * 1024 * 1024, // 10MB in bytes

            // Format restrictions
            allowedFormats: {
                'video/mp4': '.mp4'
            },

            // File count/duplicate handling
            maxFiles: 10,
            maxSimultaneousUploads: 5  // Maximum files to process at once
        },

        // Validate individual file format
        checkFormat(file) {
            // Enhanced MP4 validation
            if (!this.config.allowedFormats[file.type]) {
                return {
                    valid: false,
                    reason: `Invalid format: ${file.type || 'unknown'}. Only MP4 files are supported.`
                };
            }

            const extension = file.name.toLowerCase().split('.').pop();
            if (extension !== 'mp4') {
                return {
                    valid: false,
                    reason: `Invalid file extension: .${extension}. Only .mp4 files are supported.`
                };
            }

            return { valid: true };
        },

        // Validate individual file size
        checkFileSize(file) {
            if (file.size > this.config.maxFileSize) {
                return {
                    valid: false,
                    reason: `File exceeds maximum size: ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed is ${this.config.maxFileSize / (1024 * 1024)}MB`
                };
            }
            return { valid: true };
        },

        // Validate individual file duration
        checkDuration(duration, filename) {
            if (duration < this.config.minDuration) {
                return {
                    valid: false,
                    reason: `Video duration too short: ${duration.toFixed(1)} seconds. Minimum duration is ${this.config.minDuration} seconds`
                };
            }
            if (duration > this.config.maxDuration) {
                return {
                    valid: false,
                    reason: `Video duration too long: ${duration.toFixed(1)} seconds. Maximum duration is ${this.config.maxDuration} seconds`
                };
            }
            return { valid: true };
        },

        // Check total duration of all videos
        checkTotalDuration(existingVideos, newDuration) {
            const totalDuration = existingVideos.reduce((sum, video) => sum + video.duration, 0) + newDuration;
            if (totalDuration > this.config.totalMaxDuration) {
                return {
                    valid: false,
                    reason: `Total duration would exceed ${this.config.totalMaxDuration} seconds limit (${totalDuration.toFixed(1)} seconds)`
                };
            }
            return { valid: true };
        },

        // Check for duplicate files
        checkDuplicate(filename, existingFiles) {
            if (existingFiles.has(filename)) {
                return {
                    valid: false,
                    reason: `File "${filename}" has already been added`
                };
            }
            return { valid: true };
        },

        // Add file count validation
        checkFileCount(newFileCount, existingFileCount) {
            const totalCount = existingFileCount + newFileCount;
            if (totalCount > this.config.maxFiles) {
                return {
                    valid: false,
                    reason: `Cannot add ${newFileCount} files. Maximum ${this.config.maxFiles} files allowed (${existingFileCount} already added)`
                };
            }
            return { valid: true };
        },

        // Add check for too many simultaneous uploads
        checkSimultaneousUploads(fileCount) {
            if (fileCount > this.config.maxSimultaneousUploads) {
                return {
                    valid: false,
                    reason: `Please upload maximum ${this.config.maxSimultaneousUploads} files at once`
                };
            }
            return { valid: true };
        }
    };

    // Output Filename Generator
    const OutputFileGenerator = {
        formatDuration(seconds) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return minutes > 0 ? `${minutes}m${remainingSeconds}s` : `${remainingSeconds}s`;
        },

        generateTimings(videos) {
            let currentTime = 0;
            return videos.map(video => {
                const start = this.formatDuration(currentTime);
                currentTime += video.duration;
                const end = this.formatDuration(currentTime);
                return `${start}-${end}`;
            }).join('_');
        },

        generate(videos) {
            const date = new Date().toISOString().split('T')[0];
            const numClips = videos.length;
            const totalDuration = this.formatDuration(videos.reduce((sum, v) => sum + v.duration, 0));
            const timings = this.generateTimings(videos);

            return `merged_${numClips}clips_${totalDuration}_(${timings})_${date}.mp4`;
        }
    };

})();
