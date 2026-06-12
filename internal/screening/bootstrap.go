package screening

const (
	screeningWindowReadySentinel = "__PLOTKITYCAT_SCREENING_WINDOW_READY__"
	screeningFrameReadySentinel  = "__PLOTKITYCAT_SCREENING_FRAME_READY__"
	screeningNextSentinel        = "__PLOTKITYCAT_SCREENING_NEXT__"
	screeningPrevSentinel        = "__PLOTKITYCAT_SCREENING_PREV__"
	screeningStopSentinel        = "__PLOTKITYCAT_SCREENING_STOP__"
)

const screeningPythonBootstrap = `
import os
import runpy
import sys
import threading
import time

WINDOW_READY = os.environ.get("PLOTKITYCAT_SCREENING_WINDOW_READY_SENTINEL", "__PLOTKITYCAT_SCREENING_WINDOW_READY__")
FRAME_READY = os.environ.get("PLOTKITYCAT_SCREENING_FRAME_READY_SENTINEL", "__PLOTKITYCAT_SCREENING_FRAME_READY__")
NEXT = os.environ.get("PLOTKITYCAT_SCREENING_NEXT_SENTINEL", "__PLOTKITYCAT_SCREENING_NEXT__")
PREV = os.environ.get("PLOTKITYCAT_SCREENING_PREV_SENTINEL", "__PLOTKITYCAT_SCREENING_PREV__")
STOP = os.environ.get("PLOTKITYCAT_SCREENING_STOP_SENTINEL", "__PLOTKITYCAT_SCREENING_STOP__")
EMITTED_WINDOW_READY = False
EMITTED_FRAME_READY = False

def emit_window_ready():
    global EMITTED_WINDOW_READY
    if EMITTED_WINDOW_READY:
        return
    EMITTED_WINDOW_READY = True
    print(WINDOW_READY, flush=True)

def emit_frame_ready():
    global EMITTED_FRAME_READY
    if EMITTED_FRAME_READY:
        return
    EMITTED_FRAME_READY = True
    print(FRAME_READY, flush=True)

def emit_navigation(kind):
    print(kind, flush=True)

def patch_matplotlib():
    try:
        import matplotlib.pyplot as plt
    except Exception:
        return

    if getattr(plt, "_plotkitycat_screening_patched", False):
        return

    original_show = plt.show

    def install_callbacks():
        for figure_number in plt.get_fignums():
            figure = plt.figure(figure_number)
            canvas = figure.canvas
            if getattr(canvas, "_plotkitycat_screening_callbacks_installed", False):
                continue

            def on_click(event, canvas=canvas):
                if not getattr(event, "dblclick", False):
                    return
                width = 0
                try:
                    width = canvas.width()
                except Exception:
                    width = 0
                if width and event.x is not None and event.x < width / 2:
                    emit_navigation(PREV)
                    return
                emit_navigation(NEXT)

            def on_key(event):
                if getattr(event, "key", "") == "escape":
                    emit_navigation(STOP)

            def on_draw(event):
                emit_frame_ready()

            canvas.mpl_connect("button_press_event", on_click)
            canvas.mpl_connect("key_press_event", on_key)
            canvas.mpl_connect("draw_event", on_draw)
            canvas._plotkitycat_screening_callbacks_installed = True

    def wrapped_show(*args, **kwargs):
        install_callbacks()
        emit_window_ready()

        def request_first_frame():
            try:
                manager = plt.get_current_fig_manager()
                if manager is not None and hasattr(manager, "window"):
                    try:
                        manager.window.after(40, lambda: [fig.canvas.draw_idle() for fig in map(plt.figure, plt.get_fignums())])
                    except Exception:
                        pass
            except Exception:
                pass

            # Fallback for backends where draw_event arrives late or not at all.
            def delayed_emit():
                time.sleep(0.35)
                emit_frame_ready()

            threading.Thread(target=delayed_emit, daemon=True).start()

        request_first_frame()
        return original_show(*args, **kwargs)

    plt.show = wrapped_show
    plt._plotkitycat_screening_patched = True

patch_matplotlib()
runpy.run_path(sys.argv[1], run_name="__main__")
`
