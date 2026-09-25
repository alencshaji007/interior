"""Render a FORMA scene (GLB exported by the Three.js room kit) with Cycles.

Usage: python cycles_render.py out/scenes/<job>.json

The JSON (written by pipeline.mjs) holds the GLB path, camera spec in Three.js
coordinates, daylight description, resolution, samples and output list.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def to_blender(v):
    # glTF / Three.js is Y-up; Blender is Z-up.
    x, y, z = v
    return Vector((x, -z, y))


def setup_world(scene, light):
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    remap = nt.nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -1
    remap.inputs['From Max'].default_value = 1
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.46
    els[0].color = (*hex_to_linear(light.get('ground', '#b5ad9f')), 1)
    els[1].position = 1.0
    els[1].color = (*hex_to_linear(light['skyTop']), 1)
    mid = els.new(0.5)
    mid.color = (*hex_to_linear(light['skyBottom']), 1)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = light.get('envIntensity', 1) * 1.6
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], remap.inputs['Value'])
    nt.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_sun(scene, light):
    if light.get('sunIntensity', 0) <= 0:
        return
    data = bpy.data.lights.new('Sun', 'SUN')
    data.energy = light['sunIntensity'] * 1.5
    data.color = hex_to_linear(light.get('sunColor', '#ffffff'))
    data.angle = math.radians(1.5)
    sun = bpy.data.objects.new('Sun', data)
    scene.collection.objects.link(sun)
    direction = -to_blender(light['sun']).normalized()
    sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def setup_camera(scene, spec, width, height):
    data = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    pos, target = to_blender(spec['pos']), to_blender(spec['target'])
    cam.location = pos
    cam.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 24
    data.lens = 12 / math.tan(math.radians(spec.get('fov', 50)) / 2)
    # Architectural lens shift — keeps verticals straight while framing low.
    data.shift_y = -spec.get('shift', 0) * height / max(width, height)
    data.clip_start = 0.05
    data.clip_end = 300


def configure(scene, job):
    scene.render.engine = 'CYCLES'
    c = scene.cycles
    c.device = 'CPU'
    c.samples = int(os.environ.get('FORMA_SAMPLES') or job['samples'])
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.025
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.max_bounces = 10
    c.diffuse_bounces = 5
    c.glossy_bounces = 4
    c.transmission_bounces = 10
    c.transparent_max_bounces = 16
    c.caustics_reflective = False
    c.caustics_refractive = job.get('caustics', False)
    c.blur_glossy = 1.0
    c.sample_clamp_indirect = 8
    scene.render.threads_mode = 'AUTO'
    scene.render.resolution_x = job['width']
    scene.render.resolution_y = job['height']
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    vs = scene.view_settings
    vs.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            vs.look = look
            break
        except TypeError:
            continue
    vs.exposure = math.log2(job['lighting'].get('exposure', 1) * job.get('exposure', 1)) + 0.75


def save_outputs(scene, master, job):
    # Loaded PNG is display-referred sRGB: switch to Standard so re-encoding
    # is an identity transform.
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    for out in job['outputs']:
        img = bpy.data.images.load(master)
        w = out['width']
        h = round(w * job['height'] / job['width'])
        if (w, h) != tuple(img.size):
            img.scale(w, h)
        s = scene.render.image_settings
        s.file_format = 'WEBP' if out['format'] == 'webp' else 'JPEG'
        s.color_mode = 'RGB'
        s.quality = out['quality']
        img.save_render(os.path.join(job['outDir'], out['key']), scene=scene)
        bpy.data.images.remove(img)


def main():
    job = json.load(open(sys.argv[-1]))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job['glb'])
    scene = bpy.context.scene
    configure(scene, job)
    setup_world(scene, job['lighting'])
    setup_sun(scene, job['lighting'])
    setup_camera(scene, job['camera'], job['width'], job['height'])
    master = os.path.join(os.path.dirname(job['glb']), job['name'] + '.png')
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = master
    bpy.ops.render.render(write_still=True)
    save_outputs(scene, master, job)


main()
